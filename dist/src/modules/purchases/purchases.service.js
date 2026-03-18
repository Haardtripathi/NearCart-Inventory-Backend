"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPurchases = listPurchases;
exports.createPurchase = createPurchase;
exports.getPurchaseById = getPurchaseById;
exports.updatePurchase = updatePurchase;
exports.postPurchase = postPurchase;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const decimal_1 = require("../../utils/decimal");
const ApiError_1 = require("../../utils/ApiError");
const guards_1 = require("../../utils/guards");
const json_1 = require("../../utils/json");
const numbering_1 = require("../../utils/numbering");
const pagination_1 = require("../../utils/pagination");
const audit_service_1 = require("../audit/audit.service");
const inventory_service_1 = require("../inventory/inventory.service");
async function preparePurchaseItems(organizationId, items) {
    let subtotal = (0, decimal_1.toDecimal)(0);
    let taxTotal = (0, decimal_1.toDecimal)(0);
    let discountTotal = (0, decimal_1.toDecimal)(0);
    let total = (0, decimal_1.toDecimal)(0);
    const preparedItems = [];
    for (const item of items) {
        const variant = await (0, guards_1.assertVariantInOrg)(prisma_1.prisma, organizationId, item.variantId);
        if (variant.productId !== item.productId) {
            throw ApiError_1.ApiError.badRequest("Purchase item productId does not match the selected variant");
        }
        const quantity = (0, decimal_1.toDecimal)(item.quantity);
        const unitCost = (0, decimal_1.toDecimal)(item.unitCost);
        const taxRate = (0, decimal_1.toDecimal)(item.taxRate ?? 0);
        const discountAmount = (0, decimal_1.toDecimal)(item.discountAmount ?? 0);
        if (quantity.lessThanOrEqualTo(0)) {
            throw ApiError_1.ApiError.badRequest("Purchase quantities must be positive");
        }
        if (unitCost.isNegative()) {
            throw ApiError_1.ApiError.badRequest("Unit cost cannot be negative");
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
            metadata: (0, json_1.toNullableJsonValue)(item.metadata),
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
async function listPurchases(organizationId, query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
            ? {
                OR: [
                    { receiptNumber: { contains: query.search, mode: "insensitive" } },
                    { supplier: { name: { contains: query.search, mode: "insensitive" } } },
                ],
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.purchaseReceipt.findMany({
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
        prisma_1.prisma.purchaseReceipt.count({ where }),
    ]);
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createPurchase(organizationId, actorUserId, input) {
    await (0, guards_1.assertBranchInOrg)(prisma_1.prisma, organizationId, input.branchId);
    if (input.supplierId) {
        await (0, guards_1.assertSupplierInOrg)(prisma_1.prisma, organizationId, input.supplierId);
    }
    const prepared = await preparePurchaseItems(organizationId, input.items);
    const purchase = await prisma_1.prisma.purchaseReceipt.create({
        data: {
            organizationId,
            branchId: input.branchId,
            supplierId: input.supplierId ?? null,
            receiptNumber: input.receiptNumber ?? (0, numbering_1.generateDocumentNumber)("PR"),
            status: client_1.PurchaseReceiptStatus.DRAFT,
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
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "PurchaseReceipt",
        entityId: purchase.id,
        after: purchase,
    });
    return purchase;
}
async function getPurchaseById(organizationId, purchaseId) {
    const purchase = await prisma_1.prisma.purchaseReceipt.findFirst({
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
        throw ApiError_1.ApiError.notFound("Purchase receipt not found");
    }
    return purchase;
}
async function updatePurchase(organizationId, purchaseId, actorUserId, input) {
    const existing = await getPurchaseById(organizationId, purchaseId);
    if (existing.status !== client_1.PurchaseReceiptStatus.DRAFT) {
        throw ApiError_1.ApiError.badRequest("Only draft purchase receipts can be updated");
    }
    if (input.branchId) {
        await (0, guards_1.assertBranchInOrg)(prisma_1.prisma, organizationId, input.branchId);
    }
    if (input.supplierId) {
        await (0, guards_1.assertSupplierInOrg)(prisma_1.prisma, organizationId, input.supplierId);
    }
    const prepared = input.items ? await preparePurchaseItems(organizationId, input.items) : null;
    await prisma_1.prisma.$transaction(async (tx) => {
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
    });
    const updated = await getPurchaseById(organizationId, purchaseId);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "PurchaseReceipt",
        entityId: updated.id,
        before: existing,
        after: updated,
    });
    return updated;
}
async function postPurchase(organizationId, purchaseId, actorUserId) {
    const purchase = await getPurchaseById(organizationId, purchaseId);
    if (purchase.status === client_1.PurchaseReceiptStatus.POSTED) {
        throw ApiError_1.ApiError.badRequest("Purchase receipt has already been posted");
    }
    if (purchase.status !== client_1.PurchaseReceiptStatus.DRAFT) {
        throw ApiError_1.ApiError.badRequest("Only draft purchase receipts can be posted");
    }
    const posted = await prisma_1.prisma.$transaction(async (tx) => {
        for (const item of purchase.items) {
            await (0, inventory_service_1.applyStockMovement)(tx, {
                organizationId,
                branchId: purchase.branchId,
                variantId: item.variantId,
                movementType: client_1.StockMovementType.PURCHASE,
                referenceType: client_1.ReferenceType.PURCHASE_RECEIPT,
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
                status: client_1.PurchaseReceiptStatus.POSTED,
                receivedAt: purchase.receivedAt ?? new Date(),
            },
            include: {
                supplier: true,
                branch: true,
                items: true,
            },
        });
        await (0, audit_service_1.createAuditLog)(tx, {
            organizationId,
            actorUserId,
            action: client_1.AuditAction.STOCK_POST,
            entityType: "PurchaseReceipt",
            entityId: purchase.id,
            before: purchase,
            after: updated,
        });
        return updated;
    });
    return posted;
}
