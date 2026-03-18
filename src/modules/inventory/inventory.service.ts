import {
  AuditAction,
  BatchStatus,
  Prisma,
  ReferenceType,
  StockMovementType,
} from "@prisma/client";

import { prisma } from "../../config/prisma";
import type { DbClient } from "../../types/prisma";
import { ApiError } from "../../utils/ApiError";
import { toDecimal } from "../../utils/decimal";
import { assertBranchInOrg, assertVariantInOrg } from "../../utils/guards";
import { generateDocumentNumber } from "../../utils/numbering";
import { buildPagination, getPagination } from "../../utils/pagination";
import { getAvailableStock, isLowStock } from "../../utils/stock";
import { createAuditLog } from "../audit/audit.service";

interface ApplyStockMovementInput {
  organizationId: string;
  branchId: string;
  variantId: string;
  movementType: StockMovementType;
  referenceType: ReferenceType;
  referenceId?: string;
  quantityDelta: Prisma.Decimal.Value;
  reservedDelta?: Prisma.Decimal.Value;
  unitCost?: Prisma.Decimal.Value;
  note?: string;
  batchNumber?: string;
  expiryDate?: Date;
  manufactureDate?: Date;
  createdById?: string;
}

async function upsertBatch(db: DbClient, input: {
  organizationId: string;
  branchId: string;
  variantId: string;
  allowNegativeStock: boolean;
  batchNumber: string;
  quantityDelta: Prisma.Decimal.Value;
  expiryDate?: Date;
  manufactureDate?: Date;
  purchasePrice?: Prisma.Decimal.Value;
  sellingPrice?: Prisma.Decimal.Value;
}) {
  const delta = toDecimal(input.quantityDelta);

  const existing = await db.inventoryBatch.findFirst({
    where: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      variantId: input.variantId,
      batchNumber: input.batchNumber,
    },
  });

  if (!existing && delta.isNegative()) {
    throw ApiError.badRequest("Batch does not exist for stock reduction");
  }

  if (!existing) {
    return db.inventoryBatch.create({
      data: {
        organizationId: input.organizationId,
        branchId: input.branchId,
        variantId: input.variantId,
        batchNumber: input.batchNumber,
        expiryDate: input.expiryDate,
        manufactureDate: input.manufactureDate,
        purchasePrice: input.purchasePrice ? toDecimal(input.purchasePrice) : null,
        sellingPrice: input.sellingPrice ? toDecimal(input.sellingPrice) : null,
        quantityOnHand: delta,
        status:
          input.expiryDate && input.expiryDate < new Date() ? BatchStatus.EXPIRED : BatchStatus.ACTIVE,
      },
    });
  }

  const nextQuantity = toDecimal(existing.quantityOnHand).plus(delta);

  if (nextQuantity.isNegative() && !input.allowNegativeStock) {
    throw ApiError.badRequest("Insufficient stock in batch");
  }

  return db.inventoryBatch.update({
    where: { id: existing.id },
    data: {
      expiryDate: input.expiryDate ?? existing.expiryDate,
      manufactureDate: input.manufactureDate ?? existing.manufactureDate,
      purchasePrice: input.purchasePrice ? toDecimal(input.purchasePrice) : existing.purchasePrice,
      sellingPrice: input.sellingPrice ? toDecimal(input.sellingPrice) : existing.sellingPrice,
      quantityOnHand: nextQuantity,
      status:
        (input.expiryDate ?? existing.expiryDate) &&
        (input.expiryDate ?? existing.expiryDate)! < new Date()
          ? BatchStatus.EXPIRED
          : BatchStatus.ACTIVE,
    },
  });
}

export async function applyStockMovement(db: DbClient, input: ApplyStockMovementInput) {
  await assertBranchInOrg(db, input.organizationId, input.branchId);
  const variant = await assertVariantInOrg(db, input.organizationId, input.variantId);

  if (!variant.product.trackInventory) {
    throw ApiError.badRequest("Inventory tracking is disabled for this product");
  }

  const quantityDelta = toDecimal(input.quantityDelta);
  const reservedDelta = toDecimal(input.reservedDelta);

  const balance = await db.inventoryBalance.findUnique({
    where: {
      organizationId_branchId_variantId: {
        organizationId: input.organizationId,
        branchId: input.branchId,
        variantId: input.variantId,
      },
    },
  });

  const beforeOnHand = toDecimal(balance?.onHand);
  const beforeReserved = toDecimal(balance?.reserved);
  const afterOnHand = beforeOnHand.plus(quantityDelta);
  const afterReserved = beforeReserved.plus(reservedDelta);
  const availableAfter = getAvailableStock(afterOnHand, afterReserved);

  if (afterReserved.isNegative()) {
    throw ApiError.badRequest("Reserved stock cannot become negative");
  }

  if ((afterOnHand.isNegative() || availableAfter.isNegative()) && !variant.product.allowNegativeStock) {
    throw ApiError.badRequest("Insufficient stock available for this movement");
  }

  const updatedBalance = balance
    ? await db.inventoryBalance.update({
        where: {
          id: balance.id,
        },
        data: {
          onHand: afterOnHand,
          reserved: afterReserved,
        },
      })
    : await db.inventoryBalance.create({
        data: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          productId: variant.productId,
          variantId: input.variantId,
          onHand: afterOnHand,
          reserved: afterReserved,
          incoming: 0,
        },
      });

  const batch = input.batchNumber
    ? await upsertBatch(db, {
        organizationId: input.organizationId,
        branchId: input.branchId,
        variantId: input.variantId,
        allowNegativeStock: variant.product.allowNegativeStock,
        batchNumber: input.batchNumber,
        quantityDelta,
        expiryDate: input.expiryDate,
        manufactureDate: input.manufactureDate,
        purchasePrice: input.unitCost,
      })
    : null;

  const ledger = await db.inventoryLedger.create({
    data: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      productId: variant.productId,
      variantId: input.variantId,
      movementType: input.movementType,
      referenceType: input.referenceType,
      referenceId: input.referenceId ?? null,
      quantityDelta,
      unitCost: input.unitCost !== undefined ? toDecimal(input.unitCost) : null,
      beforeOnHand,
      afterOnHand,
      beforeReserved,
      afterReserved,
      note: input.note ?? null,
      batchId: batch?.id ?? null,
      createdById: input.createdById ?? null,
    },
  });

  return {
    balance: updatedBalance,
    ledger,
    variant,
  };
}

export async function listBalances(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    branchId?: string;
    productId?: string;
    variantId?: string;
    lowStock?: boolean;
    search?: string;
  },
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.variantId ? { variantId: query.variantId } : {}),
    ...(query.search
      ? {
          OR: [
            { product: { name: { contains: query.search, mode: "insensitive" as const } } },
            { variant: { name: { contains: query.search, mode: "insensitive" as const } } },
            { variant: { sku: { contains: query.search, mode: "insensitive" as const } } },
            { variant: { barcode: { contains: query.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const baseQuery = {
    where,
    include: {
      branch: true,
      product: true,
      variant: true,
    },
    orderBy: {
      updatedAt: "desc" as const,
    },
  };

  if (query.lowStock) {
    const rows = await prisma.inventoryBalance.findMany(baseQuery);
    const filtered = rows
      .filter((row) => isLowStock(row.onHand, row.variant.reorderLevel, row.variant.minStockLevel))
      .map((row) => ({
        ...row,
        available: getAvailableStock(row.onHand, row.reserved),
      }));

    return {
      items: filtered.slice(skip, skip + limit),
      pagination: buildPagination(page, limit, filtered.length),
    };
  }

  const [items, totalItems] = await prisma.$transaction([
    prisma.inventoryBalance.findMany({
      ...baseQuery,
      skip,
      take: limit,
    }),
    prisma.inventoryBalance.count({ where }),
  ]);

  return {
    items: items.map((row) => ({
      ...row,
      available: getAvailableStock(row.onHand, row.reserved),
    })),
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function listLedger(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    branchId?: string;
    variantId?: string;
    movementType?: StockMovementType;
    startDate?: Date;
    endDate?: Date;
  },
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.variantId ? { variantId: query.variantId } : {}),
    ...(query.movementType ? { movementType: query.movementType } : {}),
    ...(query.startDate || query.endDate
      ? {
          createdAt: {
            ...(query.startDate ? { gte: query.startDate } : {}),
            ...(query.endDate ? { lte: query.endDate } : {}),
          },
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.inventoryLedger.findMany({
      where,
      include: {
        branch: true,
        product: true,
        variant: true,
        createdBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.inventoryLedger.count({ where }),
  ]);

  return {
    items,
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createAdjustment(
  organizationId: string,
  actorUserId: string,
  input: {
    branchId: string;
    variantId: string;
    quantity: string | number;
    direction: "IN" | "OUT";
    note: string;
    unitCost?: string | number;
    batchNumber?: string;
    expiryDate?: Date;
    manufactureDate?: Date;
  },
) {
  const quantity = toDecimal(input.quantity);

  if (quantity.lessThanOrEqualTo(0)) {
    throw ApiError.badRequest("Adjustment quantity must be positive");
  }

  const movementType =
    input.direction === "IN" ? StockMovementType.ADJUSTMENT_IN : StockMovementType.ADJUSTMENT_OUT;
  const quantityDelta = input.direction === "IN" ? quantity : quantity.negated();
  const referenceId = generateDocumentNumber("ADJ");

  return prisma.$transaction(async (tx) => {
    const result = await applyStockMovement(tx, {
      organizationId,
      branchId: input.branchId,
      variantId: input.variantId,
      movementType,
      referenceType: ReferenceType.STOCK_ADJUSTMENT,
      referenceId,
      quantityDelta,
      unitCost: input.unitCost,
      note: input.note,
      batchNumber: input.batchNumber,
      expiryDate: input.expiryDate,
      manufactureDate: input.manufactureDate,
      createdById: actorUserId,
    });

    await createAuditLog(tx, {
      organizationId,
      actorUserId,
      action: AuditAction.STOCK_POST,
      entityType: "InventoryAdjustment",
      entityId: referenceId,
      after: {
        branchId: input.branchId,
        variantId: input.variantId,
        quantityDelta,
        movementType,
      },
    });

    return result;
  });
}
