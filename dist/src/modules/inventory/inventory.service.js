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
async function applyStockMovement(db, input) {
    await (0, guards_1.assertBranchInOrg)(db, input.organizationId, input.branchId);
    const variant = await (0, guards_1.assertVariantInOrg)(db, input.organizationId, input.variantId);
    if (!variant.product.trackInventory) {
        throw ApiError_1.ApiError.badRequest("Inventory tracking is disabled for this product");
    }
    const quantityDelta = (0, decimal_1.toDecimal)(input.quantityDelta);
    const reservedDelta = (0, decimal_1.toDecimal)(input.reservedDelta);
    const balance = await db.inventoryBalance.findUnique({
        where: {
            organizationId_branchId_variantId: {
                organizationId: input.organizationId,
                branchId: input.branchId,
                variantId: input.variantId,
            },
        },
    });
    const beforeOnHand = (0, decimal_1.toDecimal)(balance?.onHand);
    const beforeReserved = (0, decimal_1.toDecimal)(balance?.reserved);
    const afterOnHand = beforeOnHand.plus(quantityDelta);
    const afterReserved = beforeReserved.plus(reservedDelta);
    const availableAfter = (0, stock_1.getAvailableStock)(afterOnHand, afterReserved);
    if (afterReserved.isNegative()) {
        throw ApiError_1.ApiError.badRequest("Reserved stock cannot become negative");
    }
    if ((afterOnHand.isNegative() || availableAfter.isNegative()) && !variant.product.allowNegativeStock) {
        throw ApiError_1.ApiError.badRequest("Insufficient stock available for this movement");
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
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.variantId ? { variantId: query.variantId } : {}),
        ...(query.search
            ? {
                OR: [
                    { product: { name: { contains: query.search, mode: "insensitive" } } },
                    { variant: { name: { contains: query.search, mode: "insensitive" } } },
                    { variant: { sku: { contains: query.search, mode: "insensitive" } } },
                    { variant: { barcode: { contains: query.search, mode: "insensitive" } } },
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
        ...(query.branchId ? { branchId: query.branchId } : {}),
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
                    { note: { contains: query.search, mode: "insensitive" } },
                    { referenceId: { contains: query.search, mode: "insensitive" } },
                    { product: { name: { contains: query.search, mode: "insensitive" } } },
                    { variant: { name: { contains: query.search, mode: "insensitive" } } },
                    { variant: { sku: { contains: query.search, mode: "insensitive" } } },
                    { variant: { barcode: { contains: query.search, mode: "insensitive" } } },
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
    });
}
