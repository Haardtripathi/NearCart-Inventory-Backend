import {
  AuditAction,
  BatchStatus,
  NotificationLogType,
  Prisma,
  ReferenceType,
  StockMovementType,
} from "@prisma/client";

import { prisma } from "../../config/prisma";
import type { DbClient } from "../../types/prisma";
import { ApiError } from "../../utils/ApiError";
import { toDecimal } from "../../utils/decimal";
import { syncEntityFieldTranslations } from "../../utils/entityFieldTranslations";
import { assertBranchInOrg, assertVariantInOrg } from "../../utils/guards";
import { generateDocumentNumber } from "../../utils/numbering";
import { buildPagination, getPagination } from "../../utils/pagination";
import { getAvailableStock, isLowStock } from "../../utils/stock";
import { createAuditLog } from "../audit/audit.service";
import { recordNotificationLog } from "../notifications/notifications.service";
import { sendPushToOrgStaff } from "../../services/push-notification.service";

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

const INTERACTIVE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

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

// Two concurrent applyStockMovement calls against the SAME organizationId+branchId+variantId
// (e.g. two staff members confirming two different sales orders for the same product at the same
// branch, or a sale confirm racing a manual adjustment) previously read `InventoryBalance` once,
// computed the new onHand/reserved in JS, and wrote it back unconditionally. That's a classic
// read-modify-write race: both transactions can read the same "before" row, both pass the
// negative-stock guard against that same stale snapshot, and whichever `update` commits last wins
// — silently discarding the other's delta (a lost update) while BOTH still get an
// `InventoryLedger` row claiming a successful movement with a `beforeOnHand` that was only true
// for one of them. Net effect: onHand drifts from the true sum of its own ledger, and the
// negative-stock guard can be defeated in practice (e.g. onHand=5, two concurrent SALEs of 4 each
// can both pass the guard against the same stale beforeOnHand=5, even though combined demand of 8
// exceeds the 5 actually on hand). Fixed the same way this module's own sales-orders.service.ts
// already fixes analogous races (confirmSalesOrder/markSalesOrderReady/assignDriverToSalesOrder):
// an atomic compare-and-swap `updateMany` guarded on the exact row values just read, retried with
// a fresh read on conflict instead of trusting the earlier read to still be current.
const BALANCE_CAS_MAX_ATTEMPTS = 5;

export async function applyStockMovement(db: DbClient, input: ApplyStockMovementInput) {
  await assertBranchInOrg(db, input.organizationId, input.branchId);
  const variant = await assertVariantInOrg(db, input.organizationId, input.variantId);

  if (!variant.product.trackInventory) {
    throw ApiError.badRequest("Inventory tracking is disabled for this product");
  }

  const quantityDelta = toDecimal(input.quantityDelta);
  const reservedDelta = toDecimal(input.reservedDelta);

  // Initialized (rather than left definitely-unassigned) purely to satisfy TS's definite-
  // assignment analysis across the loop below — always overwritten on the first iteration since
  // BALANCE_CAS_MAX_ATTEMPTS > 0, these placeholder values are never actually read.
  let beforeOnHand: Prisma.Decimal = toDecimal(0);
  let beforeReserved: Prisma.Decimal = toDecimal(0);
  let afterOnHand: Prisma.Decimal = toDecimal(0);
  let afterReserved: Prisma.Decimal = toDecimal(0);
  let updatedBalance: Awaited<ReturnType<typeof db.inventoryBalance.findUniqueOrThrow>> | null = null;

  for (let attempt = 0; attempt < BALANCE_CAS_MAX_ATTEMPTS && !updatedBalance; attempt++) {
    const balance = await db.inventoryBalance.findUnique({
      where: {
        organizationId_branchId_variantId: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          variantId: input.variantId,
        },
      },
    });

    beforeOnHand = toDecimal(balance?.onHand);
    beforeReserved = toDecimal(balance?.reserved);
    afterOnHand = beforeOnHand.plus(quantityDelta);
    afterReserved = beforeReserved.plus(reservedDelta);
    const availableAfter = getAvailableStock(afterOnHand, afterReserved);

    if (afterReserved.isNegative()) {
      throw ApiError.badRequest("Reserved stock cannot become negative");
    }

    if ((afterOnHand.isNegative() || availableAfter.isNegative()) && !variant.product.allowNegativeStock) {
      throw ApiError.badRequest("Insufficient stock available for this movement");
    }

    if (!balance) {
      try {
        updatedBalance = await db.inventoryBalance.create({
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
      } catch (error) {
        // Another concurrent movement created the balance row between our findUnique and this
        // create (unique constraint on organizationId+branchId+variantId) — loop again, the next
        // iteration's findUnique will see it and take the update-CAS branch below instead.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
          throw error;
        }
      }
      continue;
    }

    // Compare-and-swap: only apply if onHand/reserved still match what we just read. If another
    // transaction committed a movement in between, `count` is 0 and we retry with a fresh read
    // instead of blindly overwriting with a value computed from stale data.
    const { count } = await db.inventoryBalance.updateMany({
      where: {
        id: balance.id,
        onHand: balance.onHand,
        reserved: balance.reserved,
      },
      data: {
        onHand: afterOnHand,
        reserved: afterReserved,
      },
    });

    if (count > 0) {
      updatedBalance = await db.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } });
    }
  }

  if (!updatedBalance) {
    throw ApiError.conflict(
      "Stock balance is being updated concurrently — please retry this movement",
    );
  }

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

  await syncEntityFieldTranslations(db, {
    organizationId: input.organizationId,
    entityType: "InventoryLedger",
    entityId: ledger.id,
    fields: [{ fieldKey: "note", value: input.note }],
  });

  // Fire a "crossed into low stock" push to shop staff — deliberately only on the ok -> low
  // transition (not on every movement while it stays low, which would spam staff on every sale of
  // an already-low item) and only when stock just decreased. `sendPushToOrgStaff` wraps its own
  // Expo call in a try/catch, so this is fire-and-forget like every other push call site in this
  // codebase (see sales-orders.service.ts's sendPushToDriver, marketplace.service.ts's
  // sendPushToOrgStaff) — a push failure must never fail the stock movement itself.
  if (quantityDelta.isNegative()) {
    const wasLowBefore = isLowStock(beforeOnHand, variant.reorderLevel, variant.minStockLevel);
    const isLowNow = isLowStock(afterOnHand, variant.reorderLevel, variant.minStockLevel);
    if (!wasLowBefore && isLowNow) {
      const productLabel = variant.product.name ?? variant.name;
      const title = "Low stock alert";
      const body = `${productLabel} (${variant.sku}) is down to ${afterOnHand.toString()} — below its reorder level.`;
      const notificationData = { type: "low_stock", variantId: variant.id, productId: variant.productId };

      void sendPushToOrgStaff(input.organizationId, {
        title,
        body,
        data: notificationData,
        channelId: "order_alert",
      });

      // Persisted alongside the fire-and-forget push above so the mobile app's alerts-history
      // screen has something to show beyond a transient OS notification — see
      // notifications.service.ts. Every caller of applyStockMovement runs it inside a
      // prisma.$transaction and passes that tx as `db`, so — unlike the network push above — this
      // is awaited on the same client, same as the existing createAuditLog calls elsewhere in
      // this file.
      await recordNotificationLog(db, {
        organizationId: input.organizationId,
        type: NotificationLogType.LOW_STOCK,
        title,
        body,
        data: notificationData,
      });
    }
  }

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
    branchId?: string | string[];
    productId?: string;
    variantId?: string;
    lowStock?: boolean;
    search?: string;
  },
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    // Unlike every other product-facing list in this codebase (see products.service.ts's
    // pervasive `deletedAt: null` filters), this query never excluded soft-deleted products/
    // variants — an archived product's stale InventoryBalance row kept showing up in
    // `/api/inventory/balances` (and, via `?lowStock=true`, in the dashboard's low-stock
    // preview/count and the mobile app's low-stock badges) forever. Confirmed live 2026-08-08.
    product: { deletedAt: null },
    variant: { deletedAt: null },
    // branchId may be a single id (explicit ?branchId= filter) or an array (a branch-scoped
    // caller with no explicit filter — see resolveBranchFilter in utils/branchAccess.ts, wired in
    // from the controller) — narrow to `{ in: [...] }` for the latter so the response only ever
    // includes branches the caller actually has access to.
    ...(query.branchId
      ? { branchId: Array.isArray(query.branchId) ? { in: query.branchId } : query.branchId }
      : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.variantId ? { variantId: query.variantId } : {}),
    ...(query.search
      ? {
          OR: [
            { product: { name: { contains: query.search } } },
            { variant: { name: { contains: query.search } } },
            { variant: { sku: { contains: query.search } } },
            { variant: { barcode: { contains: query.search } } },
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
    branchId?: string | string[];
    productId?: string;
    variantId?: string;
    movementType?: StockMovementType;
    startDate?: Date;
    endDate?: Date;
    search?: string;
  },
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    // See listBalances above — branchId may be a single explicit filter or a branch-scoped
    // caller's allowed-set array.
    ...(query.branchId
      ? { branchId: Array.isArray(query.branchId) ? { in: query.branchId } : query.branchId }
      : {}),
    ...(query.productId ? { productId: query.productId } : {}),
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
    ...(query.search
      ? {
          OR: [
            { note: { contains: query.search } },
            { referenceId: { contains: query.search } },
            { product: { name: { contains: query.search } } },
            { variant: { name: { contains: query.search } } },
            { variant: { sku: { contains: query.search } } },
            { variant: { barcode: { contains: query.search } } },
          ],
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
  }, INTERACTIVE_TRANSACTION_OPTIONS);
}
