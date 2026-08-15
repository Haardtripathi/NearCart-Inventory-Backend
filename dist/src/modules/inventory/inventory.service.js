"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyStockMovement = applyStockMovement;
exports.listBalances = listBalances;
exports.listLedger = listLedger;
exports.createAdjustment = createAdjustment;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const decimal_1 = require("../../utils/decimal");
const entityFieldTranslations_1 = require("../../utils/entityFieldTranslations");
const guards_1 = require("../../utils/guards");
const numbering_1 = require("../../utils/numbering");
const pagination_1 = require("../../utils/pagination");
const stock_1 = require("../../utils/stock");
const audit_service_1 = require("../audit/audit.service");
const notifications_service_1 = require("../notifications/notifications.service");
const push_notification_service_1 = require("../../services/push-notification.service");
const INTERACTIVE_TRANSACTION_OPTIONS = {
    maxWait: 10_000,
    timeout: 30_000,
};
async function upsertBatch(db, input) {
    const delta = (0, decimal_1.toDecimal)(input.quantityDelta);
    const existing = await db.inventoryBatch.findFirst({
        where: {
            organizationId: input.organizationId,
            branchId: input.branchId,
            variantId: input.variantId,
            batchNumber: input.batchNumber,
        },
    });
    if (!existing && delta.isNegative()) {
        throw ApiError_1.ApiError.badRequest("Batch does not exist for stock reduction");
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
                purchasePrice: input.purchasePrice ? (0, decimal_1.toDecimal)(input.purchasePrice) : null,
                sellingPrice: input.sellingPrice ? (0, decimal_1.toDecimal)(input.sellingPrice) : null,
                quantityOnHand: delta,
                status: input.expiryDate && input.expiryDate < new Date() ? client_1.BatchStatus.EXPIRED : client_1.BatchStatus.ACTIVE,
            },
        });
    }
    const nextQuantity = (0, decimal_1.toDecimal)(existing.quantityOnHand).plus(delta);
    if (nextQuantity.isNegative() && !input.allowNegativeStock) {
        throw ApiError_1.ApiError.badRequest("Insufficient stock in batch");
    }
    return db.inventoryBatch.update({
        where: { id: existing.id },
        data: {
            expiryDate: input.expiryDate ?? existing.expiryDate,
            manufactureDate: input.manufactureDate ?? existing.manufactureDate,
            purchasePrice: input.purchasePrice ? (0, decimal_1.toDecimal)(input.purchasePrice) : existing.purchasePrice,
            sellingPrice: input.sellingPrice ? (0, decimal_1.toDecimal)(input.sellingPrice) : existing.sellingPrice,
            quantityOnHand: nextQuantity,
            status: (input.expiryDate ?? existing.expiryDate) &&
                (input.expiryDate ?? existing.expiryDate) < new Date()
                ? client_1.BatchStatus.EXPIRED
                : client_1.BatchStatus.ACTIVE,
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
async function applyStockMovement(db, input) {
    await (0, guards_1.assertBranchInOrg)(db, input.organizationId, input.branchId);
    const variant = await (0, guards_1.assertVariantInOrg)(db, input.organizationId, input.variantId);
    if (!variant.product.trackInventory) {
        throw ApiError_1.ApiError.badRequest("Inventory tracking is disabled for this product");
    }
    const quantityDelta = (0, decimal_1.toDecimal)(input.quantityDelta);
    const reservedDelta = (0, decimal_1.toDecimal)(input.reservedDelta);
    // Initialized (rather than left definitely-unassigned) purely to satisfy TS's definite-
    // assignment analysis across the loop below — always overwritten on the first iteration since
    // BALANCE_CAS_MAX_ATTEMPTS > 0, these placeholder values are never actually read.
    let beforeOnHand = (0, decimal_1.toDecimal)(0);
    let beforeReserved = (0, decimal_1.toDecimal)(0);
    let afterOnHand = (0, decimal_1.toDecimal)(0);
    let afterReserved = (0, decimal_1.toDecimal)(0);
    let updatedBalance = null;
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
        beforeOnHand = (0, decimal_1.toDecimal)(balance?.onHand);
        beforeReserved = (0, decimal_1.toDecimal)(balance?.reserved);
        afterOnHand = beforeOnHand.plus(quantityDelta);
        afterReserved = beforeReserved.plus(reservedDelta);
        const availableAfter = (0, stock_1.getAvailableStock)(afterOnHand, afterReserved);
        if (afterReserved.isNegative()) {
            throw ApiError_1.ApiError.badRequest("Reserved stock cannot become negative");
        }
        if ((afterOnHand.isNegative() || availableAfter.isNegative()) && !variant.product.allowNegativeStock) {
            throw ApiError_1.ApiError.badRequest("Insufficient stock available for this movement");
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
            }
            catch (error) {
                // Another concurrent movement created the balance row between our findUnique and this
                // create (unique constraint on organizationId+branchId+variantId) — loop again, the next
                // iteration's findUnique will see it and take the update-CAS branch below instead.
                if (!(error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
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
        throw ApiError_1.ApiError.conflict("Stock balance is being updated concurrently — please retry this movement");
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
            unitCost: input.unitCost !== undefined ? (0, decimal_1.toDecimal)(input.unitCost) : null,
            beforeOnHand,
            afterOnHand,
            beforeReserved,
            afterReserved,
            note: input.note ?? null,
            batchId: batch?.id ?? null,
            createdById: input.createdById ?? null,
        },
    });
    await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(db, {
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
        const wasLowBefore = (0, stock_1.isLowStock)(beforeOnHand, variant.reorderLevel, variant.minStockLevel);
        const isLowNow = (0, stock_1.isLowStock)(afterOnHand, variant.reorderLevel, variant.minStockLevel);
        if (!wasLowBefore && isLowNow) {
            const productLabel = variant.product.name ?? variant.name;
            const title = "Low stock alert";
            const body = `${productLabel} (${variant.sku}) is down to ${afterOnHand.toString()} — below its reorder level.`;
            const notificationData = { type: "low_stock", variantId: variant.id, productId: variant.productId };
            void (0, push_notification_service_1.sendPushToOrgStaff)(input.organizationId, {
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
            await (0, notifications_service_1.recordNotificationLog)(db, {
                organizationId: input.organizationId,
                type: client_1.NotificationLogType.LOW_STOCK,
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
async function listBalances(organizationId, query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
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
            updatedAt: "desc",
        },
    };
    if (query.lowStock) {
        const rows = await prisma_1.prisma.inventoryBalance.findMany(baseQuery);
        const filtered = rows
            .filter((row) => (0, stock_1.isLowStock)(row.onHand, row.variant.reorderLevel, row.variant.minStockLevel))
            .map((row) => ({
            ...row,
            available: (0, stock_1.getAvailableStock)(row.onHand, row.reserved),
        }));
        return {
            items: filtered.slice(skip, skip + limit),
            pagination: (0, pagination_1.buildPagination)(page, limit, filtered.length),
        };
    }
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.inventoryBalance.findMany({
            ...baseQuery,
            skip,
            take: limit,
        }),
        prisma_1.prisma.inventoryBalance.count({ where }),
    ]);
    return {
        items: items.map((row) => ({
            ...row,
            available: (0, stock_1.getAvailableStock)(row.onHand, row.reserved),
        })),
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function listLedger(organizationId, query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
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
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.inventoryLedger.findMany({
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
        prisma_1.prisma.inventoryLedger.count({ where }),
    ]);
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createAdjustment(organizationId, actorUserId, input) {
    const quantity = (0, decimal_1.toDecimal)(input.quantity);
    if (quantity.lessThanOrEqualTo(0)) {
        throw ApiError_1.ApiError.badRequest("Adjustment quantity must be positive");
    }
    const movementType = input.direction === "IN" ? client_1.StockMovementType.ADJUSTMENT_IN : client_1.StockMovementType.ADJUSTMENT_OUT;
    const quantityDelta = input.direction === "IN" ? quantity : quantity.negated();
    const referenceId = (0, numbering_1.generateDocumentNumber)("ADJ");
    return prisma_1.prisma.$transaction(async (tx) => {
        const result = await applyStockMovement(tx, {
            organizationId,
            branchId: input.branchId,
            variantId: input.variantId,
            movementType,
            referenceType: client_1.ReferenceType.STOCK_ADJUSTMENT,
            referenceId,
            quantityDelta,
            unitCost: input.unitCost,
            note: input.note,
            batchNumber: input.batchNumber,
            expiryDate: input.expiryDate,
            manufactureDate: input.manufactureDate,
            createdById: actorUserId,
        });
        await (0, audit_service_1.createAuditLog)(tx, {
            organizationId,
            actorUserId,
            action: client_1.AuditAction.STOCK_POST,
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
