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
const entityFieldTranslations_1 = require("../../utils/entityFieldTranslations");
const guards_1 = require("../../utils/guards");
const json_1 = require("../../utils/json");
const numbering_1 = require("../../utils/numbering");
const pagination_1 = require("../../utils/pagination");
const audit_service_1 = require("../audit/audit.service");
const inventory_service_1 = require("../inventory/inventory.service");
const INTERACTIVE_TRANSACTION_OPTIONS = {
    maxWait: 10_000,
    timeout: 30_000,
};
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
        // branchId may be a single explicit filter or a branch-scoped caller's allowed-set array —
        // see resolveBranchFilter in utils/branchAccess.ts, wired in from the controller.
        ...(query.branchId
            ? { branchId: Array.isArray(query.branchId) ? { in: query.branchId } : query.branchId }
            : {}),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
            ? {
                OR: [
                    { receiptNumber: { contains: query.search } },
                    { supplier: { name: { contains: query.search } } },
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
    await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(prisma_1.prisma, {
        organizationId,
        entityType: "PurchaseReceipt",
        entityId: purchase.id,
        fields: [{ fieldKey: "notes", value: input.notes }],
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
        // Bug fix: this used to be a plain `tx.purchaseReceipt.update({where: {id: purchaseId}})` with
        // no status predicate — a concurrent `postPurchase` that had already moved the receipt out of
        // DRAFT between the check above and this write would be silently overridden, rewriting
        // items/totals on a receipt that's already POSTED (with stock already credited for the OLD
        // quantities). Guarded the same way `postPurchase` already guards its own DRAFT -> POSTED
        // transition: atomic `updateMany` re-checking status at write time, conflict if it no longer
        // matches. `postPurchase` additionally re-reads items fresh inside its own transaction after
        // its claim (see below), so this and that fix close both directions of the same race.
        const { count } = await tx.purchaseReceipt.updateMany({
            where: { id: purchaseId, organizationId, status: client_1.PurchaseReceiptStatus.DRAFT },
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
        if (count === 0) {
            throw ApiError_1.ApiError.conflict("Purchase receipt is no longer draft — it may have changed status concurrently and can no longer be edited");
        }
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
        await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(tx, {
            organizationId,
            entityType: "PurchaseReceipt",
            entityId: purchaseId,
            fields: [{ fieldKey: "notes", value: input.notes ?? existing.notes }],
        });
    }, INTERACTIVE_TRANSACTION_OPTIONS);
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
        // Bug fixed: same TOCTOU race already fixed in this session's sales-orders/stock-transfers
        // work — this used to apply every item's stock movement FIRST and only write DRAFT -> POSTED
        // at the end, guarded only by a pre-transaction status snapshot. Two concurrent posts of the
        // same DRAFT receipt (double-click, or two staff members) would both pass that stale check and
        // both apply PURCHASE movements — double-crediting the incoming stock. Claim the transition
        // atomically first via `updateMany` so a second concurrent caller gets a conflict instead.
        const { count } = await tx.purchaseReceipt.updateMany({
            where: { id: purchaseId, organizationId, status: client_1.PurchaseReceiptStatus.DRAFT },
            data: {
                status: client_1.PurchaseReceiptStatus.POSTED,
                receivedAt: purchase.receivedAt ?? new Date(),
            },
        });
        if (count === 0) {
            throw ApiError_1.ApiError.conflict("Purchase receipt is no longer draft — it may have already been posted");
        }
        // Bug fix: re-read the receipt's CURRENT items/branch inside the transaction, right after the
        // atomic claim above, instead of using `purchase` (read before this transaction started). If a
        // concurrent PATCH /purchases/:id edited quantities/cost/branch between that outer read and
        // this claim succeeding, `purchase.items`/`purchase.branchId` would be stale — crediting
        // incoming stock for quantities that no longer match what PurchaseReceiptItem actually holds.
        // See sales-orders.service.ts's confirmSalesOrder for the fuller rationale behind this same
        // pattern; updatePurchase's own atomic CAS guard closes the other half of this race (an edit
        // landing after this claim now correctly fails instead of overwriting an already-POSTED
        // receipt's items post-hoc).
        const updated = await tx.purchaseReceipt.findUniqueOrThrow({
            where: { id: purchaseId },
            include: {
                supplier: true,
                branch: true,
                items: true,
            },
        });
        for (const item of updated.items) {
            await (0, inventory_service_1.applyStockMovement)(tx, {
                organizationId,
                branchId: updated.branchId,
                variantId: item.variantId,
                movementType: client_1.StockMovementType.PURCHASE,
                referenceType: client_1.ReferenceType.PURCHASE_RECEIPT,
                referenceId: updated.id,
                quantityDelta: item.quantity,
                unitCost: item.unitCost,
                note: updated.notes ?? undefined,
                batchNumber: item.batchNumber ?? undefined,
                expiryDate: item.expiryDate ?? undefined,
                createdById: actorUserId,
            });
        }
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
    }, INTERACTIVE_TRANSACTION_OPTIONS);
    return posted;
}
