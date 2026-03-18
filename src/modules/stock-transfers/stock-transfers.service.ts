import {
  AuditAction,
  ReferenceType,
  StockMovementType,
  StockTransferStatus,
} from "@prisma/client";

import { prisma } from "../../config/prisma";
import { toDecimal } from "../../utils/decimal";
import { ApiError } from "../../utils/ApiError";
import { assertBranchInOrg, assertVariantInOrg } from "../../utils/guards";
import { generateDocumentNumber } from "../../utils/numbering";
import { buildPagination, getPagination } from "../../utils/pagination";
import { createAuditLog } from "../audit/audit.service";
import { applyStockMovement } from "../inventory/inventory.service";

interface StockTransferItemInput {
  productId: string;
  variantId: string;
  quantity: string | number;
  unitCost?: string | number;
}

async function prepareTransferItems(organizationId: string, items: StockTransferItemInput[]) {
  const prepared = [];

  for (const item of items) {
    const variant = await assertVariantInOrg(prisma, organizationId, item.variantId);

    if (variant.productId !== item.productId) {
      throw ApiError.badRequest("Stock transfer item productId does not match the selected variant");
    }

    const quantity = toDecimal(item.quantity);

    if (quantity.lessThanOrEqualTo(0)) {
      throw ApiError.badRequest("Transfer quantity must be positive");
    }

    prepared.push({
      productId: item.productId,
      variantId: item.variantId,
      quantity,
      unitCost: item.unitCost !== undefined ? toDecimal(item.unitCost) : variant.costPrice,
    });
  }

  return prepared;
}

export async function listStockTransfers(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
    fromBranchId?: string;
    toBranchId?: string;
    status?: StockTransferStatus;
  },
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    ...(query.fromBranchId ? { fromBranchId: query.fromBranchId } : {}),
    ...(query.toBranchId ? { toBranchId: query.toBranchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          transferNumber: { contains: query.search, mode: "insensitive" as const },
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.stockTransfer.findMany({
      where,
      include: {
        fromBranch: true,
        toBranch: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.stockTransfer.count({ where }),
  ]);

  return {
    items,
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createStockTransfer(
  organizationId: string,
  actorUserId: string,
  input: {
    fromBranchId: string;
    toBranchId: string;
    transferNumber?: string;
    notes?: string;
    items: StockTransferItemInput[];
  },
) {
  if (input.fromBranchId === input.toBranchId) {
    throw ApiError.badRequest("Source and destination branch cannot be same");
  }

  await assertBranchInOrg(prisma, organizationId, input.fromBranchId);
  await assertBranchInOrg(prisma, organizationId, input.toBranchId);
  const items = await prepareTransferItems(organizationId, input.items);

  const transfer = await prisma.stockTransfer.create({
    data: {
      organizationId,
      fromBranchId: input.fromBranchId,
      toBranchId: input.toBranchId,
      transferNumber: input.transferNumber ?? generateDocumentNumber("TR"),
      status: StockTransferStatus.DRAFT,
      notes: input.notes ?? null,
      createdById: actorUserId,
      items: {
        create: items,
      },
    },
    include: {
      items: true,
      fromBranch: true,
      toBranch: true,
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "StockTransfer",
    entityId: transfer.id,
    after: transfer,
  });

  return transfer;
}

export async function getStockTransferById(organizationId: string, transferId: string) {
  const transfer = await prisma.stockTransfer.findFirst({
    where: {
      id: transferId,
      organizationId,
    },
    include: {
      fromBranch: true,
      toBranch: true,
      items: {
        include: {
          product: true,
          variant: true,
        },
      },
    },
  });

  if (!transfer) {
    throw ApiError.notFound("Stock transfer not found");
  }

  return transfer;
}

export async function updateStockTransfer(
  organizationId: string,
  transferId: string,
  actorUserId: string,
  input: {
    fromBranchId?: string;
    toBranchId?: string;
    transferNumber?: string;
    notes?: string;
    items?: StockTransferItemInput[];
  },
) {
  const existing = await getStockTransferById(organizationId, transferId);

  if (existing.status !== StockTransferStatus.DRAFT) {
    throw ApiError.badRequest("Only draft transfers can be updated");
  }

  const fromBranchId = input.fromBranchId ?? existing.fromBranchId;
  const toBranchId = input.toBranchId ?? existing.toBranchId;

  if (fromBranchId === toBranchId) {
    throw ApiError.badRequest("Source and destination branch cannot be same");
  }

  if (input.fromBranchId) {
    await assertBranchInOrg(prisma, organizationId, input.fromBranchId);
  }

  if (input.toBranchId) {
    await assertBranchInOrg(prisma, organizationId, input.toBranchId);
  }

  const items = input.items ? await prepareTransferItems(organizationId, input.items) : null;

  await prisma.$transaction(async (tx) => {
    await tx.stockTransfer.update({
      where: { id: transferId },
      data: {
        ...(input.fromBranchId ? { fromBranchId: input.fromBranchId } : {}),
        ...(input.toBranchId ? { toBranchId: input.toBranchId } : {}),
        ...(input.transferNumber ? { transferNumber: input.transferNumber } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
    });

    if (items) {
      await tx.stockTransferItem.deleteMany({
        where: {
          stockTransferId: transferId,
        },
      });

      await tx.stockTransferItem.createMany({
        data: items.map((item) => ({
          stockTransferId: transferId,
          ...item,
        })),
      });
    }
  });

  const updated = await getStockTransferById(organizationId, transferId);

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "StockTransfer",
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function approveStockTransfer(organizationId: string, transferId: string, actorUserId: string) {
  const transfer = await getStockTransferById(organizationId, transferId);

  if (transfer.status !== StockTransferStatus.DRAFT) {
    throw ApiError.badRequest("Only draft transfers can be approved");
  }

  if (transfer.fromBranchId === transfer.toBranchId) {
    throw ApiError.badRequest("Source and destination branch cannot be same");
  }

  const approved = await prisma.$transaction(async (tx) => {
    for (const item of transfer.items) {
      await applyStockMovement(tx, {
        organizationId,
        branchId: transfer.fromBranchId,
        variantId: item.variantId,
        movementType: StockMovementType.TRANSFER_OUT,
        referenceType: ReferenceType.STOCK_TRANSFER,
        referenceId: transfer.id,
        quantityDelta: toDecimal(item.quantity).negated(),
        unitCost: item.unitCost ?? undefined,
        note: transfer.notes ?? undefined,
        createdById: actorUserId,
      });

      await applyStockMovement(tx, {
        organizationId,
        branchId: transfer.toBranchId,
        variantId: item.variantId,
        movementType: StockMovementType.TRANSFER_IN,
        referenceType: ReferenceType.STOCK_TRANSFER,
        referenceId: transfer.id,
        quantityDelta: item.quantity,
        unitCost: item.unitCost ?? undefined,
        note: transfer.notes ?? undefined,
        createdById: actorUserId,
      });
    }

    const updated = await tx.stockTransfer.update({
      where: { id: transferId },
      data: {
        status: StockTransferStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: actorUserId,
      },
    });

    await createAuditLog(tx, {
      organizationId,
      actorUserId,
      action: AuditAction.TRANSFER_APPROVE,
      entityType: "StockTransfer",
      entityId: transfer.id,
      before: transfer,
      after: updated,
    });

    return updated;
  });

  return approved;
}

export async function cancelStockTransfer(organizationId: string, transferId: string, actorUserId: string) {
  const transfer = await getStockTransferById(organizationId, transferId);

  if (transfer.status !== StockTransferStatus.DRAFT) {
    throw ApiError.badRequest("Only draft transfers can be cancelled");
  }

  const cancelled = await prisma.stockTransfer.update({
    where: { id: transferId },
    data: {
      status: StockTransferStatus.CANCELLED,
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "StockTransfer",
    entityId: transfer.id,
    before: transfer,
    after: cancelled,
  });

  return cancelled;
}
