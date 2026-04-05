import { AuditAction, PurchaseReceiptStatus, ReferenceType, StockMovementType } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { toDecimal } from "../../utils/decimal";
import { ApiError } from "../../utils/ApiError";
import { syncEntityFieldTranslations } from "../../utils/entityFieldTranslations";
import { assertBranchInOrg, assertSupplierInOrg, assertVariantInOrg } from "../../utils/guards";
import { toNullableJsonValue } from "../../utils/json";
import { generateDocumentNumber } from "../../utils/numbering";
import { buildPagination, getPagination } from "../../utils/pagination";
import { createAuditLog } from "../audit/audit.service";
import { applyStockMovement } from "../inventory/inventory.service";

interface PurchaseItemInput {
  productId: string;
  variantId: string;
  quantity: string | number;
  unitCost: string | number;
  taxRate?: string | number;
  discountAmount?: string | number;
  batchNumber?: string;
  expiryDate?: Date;
  metadata?: unknown;
}

const INTERACTIVE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

async function preparePurchaseItems(organizationId: string, items: PurchaseItemInput[]) {
  let subtotal = toDecimal(0);
  let taxTotal = toDecimal(0);
  let discountTotal = toDecimal(0);
  let total = toDecimal(0);

  const preparedItems = [];

  for (const item of items) {
    const variant = await assertVariantInOrg(prisma, organizationId, item.variantId);

    if (variant.productId !== item.productId) {
      throw ApiError.badRequest("Purchase item productId does not match the selected variant");
    }

    const quantity = toDecimal(item.quantity);
    const unitCost = toDecimal(item.unitCost);
    const taxRate = toDecimal(item.taxRate ?? 0);
    const discountAmount = toDecimal(item.discountAmount ?? 0);

    if (quantity.lessThanOrEqualTo(0)) {
      throw ApiError.badRequest("Purchase quantities must be positive");
    }

    if (unitCost.isNegative()) {
      throw ApiError.badRequest("Unit cost cannot be negative");
    }

    const lineBase = quantity.mul(unitCost);
    const taxAmount = lineBase.mul(taxRate).div(100);
    const lineTotal = lineBase.minus(discountAmount).plus(taxAmount);

    subtotal = subtotal.plus(lineBase);
    taxTotal = taxTotal.plus(taxAmount);
    discountTotal = discountTotal.plus(discountAmount);
    total = total.plus(lineTotal);

    preparedItems.push({
      productId: item.productId,
      variantId: item.variantId,
      quantity,
      unitCost,
      taxRate,
      taxAmount,
      discountAmount,
      lineTotal,
      batchNumber: item.batchNumber ?? null,
      expiryDate: item.expiryDate,
      metadata: toNullableJsonValue(item.metadata),
    });
  }

  return {
    items: preparedItems,
    totals: {
      subtotal,
      taxTotal,
      discountTotal,
      total,
    },
  };
}

export async function listPurchases(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
    branchId?: string;
    supplierId?: string;
    status?: PurchaseReceiptStatus;
  },
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { receiptNumber: { contains: query.search, mode: "insensitive" as const } },
            { supplier: { name: { contains: query.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.purchaseReceipt.findMany({
      where,
      include: {
        branch: true,
        supplier: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.purchaseReceipt.count({ where }),
  ]);

  return {
    items,
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createPurchase(
  organizationId: string,
  actorUserId: string,
  input: {
    branchId: string;
    supplierId?: string;
    receiptNumber?: string;
    invoiceDate?: Date;
    receivedAt?: Date;
    notes?: string;
    items: PurchaseItemInput[];
  },
) {
  await assertBranchInOrg(prisma, organizationId, input.branchId);

  if (input.supplierId) {
    await assertSupplierInOrg(prisma, organizationId, input.supplierId);
  }

  const prepared = await preparePurchaseItems(organizationId, input.items);

  const purchase = await prisma.purchaseReceipt.create({
    data: {
      organizationId,
      branchId: input.branchId,
      supplierId: input.supplierId ?? null,
      receiptNumber: input.receiptNumber ?? generateDocumentNumber("PR"),
      status: PurchaseReceiptStatus.DRAFT,
      invoiceDate: input.invoiceDate,
      receivedAt: input.receivedAt,
      notes: input.notes ?? null,
      createdById: actorUserId,
      subtotal: prepared.totals.subtotal,
      taxTotal: prepared.totals.taxTotal,
      discountTotal: prepared.totals.discountTotal,
      total: prepared.totals.total,
      items: {
        createMany: {
          data: prepared.items,
        },
      },
    },
    include: {
      items: true,
      supplier: true,
      branch: true,
    },
  });

  await syncEntityFieldTranslations(prisma, {
    organizationId,
    entityType: "PurchaseReceipt",
    entityId: purchase.id,
    fields: [{ fieldKey: "notes", value: input.notes }],
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "PurchaseReceipt",
    entityId: purchase.id,
    after: purchase,
  });

  return purchase;
}

export async function getPurchaseById(organizationId: string, purchaseId: string) {
  const purchase = await prisma.purchaseReceipt.findFirst({
    where: {
      id: purchaseId,
      organizationId,
    },
    include: {
      supplier: true,
      branch: true,
      items: {
        include: {
          product: true,
          variant: true,
        },
      },
    },
  });

  if (!purchase) {
    throw ApiError.notFound("Purchase receipt not found");
  }

  return purchase;
}

export async function updatePurchase(
  organizationId: string,
  purchaseId: string,
  actorUserId: string,
  input: {
    branchId?: string;
    supplierId?: string;
    receiptNumber?: string;
    invoiceDate?: Date;
    receivedAt?: Date;
    notes?: string;
    items?: PurchaseItemInput[];
  },
) {
  const existing = await getPurchaseById(organizationId, purchaseId);

  if (existing.status !== PurchaseReceiptStatus.DRAFT) {
    throw ApiError.badRequest("Only draft purchase receipts can be updated");
  }

  if (input.branchId) {
    await assertBranchInOrg(prisma, organizationId, input.branchId);
  }

  if (input.supplierId) {
    await assertSupplierInOrg(prisma, organizationId, input.supplierId);
  }

  const prepared = input.items ? await preparePurchaseItems(organizationId, input.items) : null;

  await prisma.$transaction(async (tx) => {
    await tx.purchaseReceipt.update({
      where: { id: purchaseId },
      data: {
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId || null } : {}),
        ...(input.receiptNumber ? { receiptNumber: input.receiptNumber } : {}),
        ...(input.invoiceDate !== undefined ? { invoiceDate: input.invoiceDate } : {}),
        ...(input.receivedAt !== undefined ? { receivedAt: input.receivedAt } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(prepared
          ? {
              subtotal: prepared.totals.subtotal,
              taxTotal: prepared.totals.taxTotal,
              discountTotal: prepared.totals.discountTotal,
              total: prepared.totals.total,
            }
          : {}),
      },
    });

    if (prepared) {
      await tx.purchaseReceiptItem.deleteMany({
        where: {
          purchaseReceiptId: purchaseId,
        },
      });

      await tx.purchaseReceiptItem.createMany({
        data: prepared.items.map((item) => ({
          purchaseReceiptId: purchaseId,
          ...item,
        })),
      });
    }

    await syncEntityFieldTranslations(tx, {
      organizationId,
      entityType: "PurchaseReceipt",
      entityId: purchaseId,
      fields: [{ fieldKey: "notes", value: input.notes ?? existing.notes }],
    });
  }, INTERACTIVE_TRANSACTION_OPTIONS);

  const updated = await getPurchaseById(organizationId, purchaseId);

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "PurchaseReceipt",
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function postPurchase(organizationId: string, purchaseId: string, actorUserId: string) {
  const purchase = await getPurchaseById(organizationId, purchaseId);

  if (purchase.status === PurchaseReceiptStatus.POSTED) {
    throw ApiError.badRequest("Purchase receipt has already been posted");
  }

  if (purchase.status !== PurchaseReceiptStatus.DRAFT) {
    throw ApiError.badRequest("Only draft purchase receipts can be posted");
  }

  const posted = await prisma.$transaction(async (tx) => {
    for (const item of purchase.items) {
      await applyStockMovement(tx, {
        organizationId,
        branchId: purchase.branchId,
        variantId: item.variantId,
        movementType: StockMovementType.PURCHASE,
        referenceType: ReferenceType.PURCHASE_RECEIPT,
        referenceId: purchase.id,
        quantityDelta: item.quantity,
        unitCost: item.unitCost,
        note: purchase.notes ?? undefined,
        batchNumber: item.batchNumber ?? undefined,
        expiryDate: item.expiryDate ?? undefined,
        createdById: actorUserId,
      });
    }

    const updated = await tx.purchaseReceipt.update({
      where: { id: purchaseId },
      data: {
        status: PurchaseReceiptStatus.POSTED,
        receivedAt: purchase.receivedAt ?? new Date(),
      },
      include: {
        supplier: true,
        branch: true,
        items: true,
      },
    });

    await createAuditLog(tx, {
      organizationId,
      actorUserId,
      action: AuditAction.STOCK_POST,
      entityType: "PurchaseReceipt",
      entityId: purchase.id,
      before: purchase,
      after: updated,
    });

    return updated;
  }, INTERACTIVE_TRANSACTION_OPTIONS);

  return posted;
}
