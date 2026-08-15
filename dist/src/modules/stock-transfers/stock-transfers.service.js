"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listStockTransfers = listStockTransfers;
exports.createStockTransfer = createStockTransfer;
exports.getStockTransferById = getStockTransferById;
exports.updateStockTransfer = updateStockTransfer;
exports.approveStockTransfer = approveStockTransfer;
exports.cancelStockTransfer = cancelStockTransfer;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const decimal_1 = require("../../utils/decimal");
const ApiError_1 = require("../../utils/ApiError");
const entityFieldTranslations_1 = require("../../utils/entityFieldTranslations");
const guards_1 = require("../../utils/guards");
const numbering_1 = require("../../utils/numbering");
const pagination_1 = require("../../utils/pagination");
const audit_service_1 = require("../audit/audit.service");
const inventory_service_1 = require("../inventory/inventory.service");
const INTERACTIVE_TRANSACTION_OPTIONS = {
    maxWait: 10_000,
    timeout: 30_000,
};
async function prepareTransferItems(organizationId, items) {
    const prepared = [];
    for (const item of items) {
        const variant = await (0, guards_1.assertVariantInOrg)(prisma_1.prisma, organizationId, item.variantId);
        if (variant.productId !== item.productId) {
            throw ApiError_1.ApiError.badRequest("Stock transfer item productId does not match the selected variant");
        }
        const quantity = (0, decimal_1.toDecimal)(item.quantity);
        if (quantity.lessThanOrEqualTo(0)) {
            throw ApiError_1.ApiError.badRequest("Transfer quantity must be positive");
        }
        prepared.push({
            productId: item.productId,
            variantId: item.variantId,
            quantity,
            unitCost: item.unitCost !== undefined ? (0, decimal_1.toDecimal)(item.unitCost) : variant.costPrice,
        });
    }
    return prepared;
}
async function listStockTransfers(organizationId, query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        ...(query.fromBranchId ? { fromBranchId: query.fromBranchId } : {}),
        ...(query.toBranchId ? { toBranchId: query.toBranchId } : {}),
        ...(query.accessibleBranchIds && !query.fromBranchId && !query.toBranchId
            ? {
                OR: [
                    { fromBranchId: { in: query.accessibleBranchIds } },
                    { toBranchId: { in: query.accessibleBranchIds } },
                ],
            }
            : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
            ? {
                transferNumber: { contains: query.search },
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.stockTransfer.findMany({
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
        prisma_1.prisma.stockTransfer.count({ where }),
    ]);
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createStockTransfer(organizationId, actorUserId, input) {
    if (input.fromBranchId === input.toBranchId) {
        throw ApiError_1.ApiError.badRequest("Source and destination branch cannot be same");
    }
    await (0, guards_1.assertBranchInOrg)(prisma_1.prisma, organizationId, input.fromBranchId);
    await (0, guards_1.assertBranchInOrg)(prisma_1.prisma, organizationId, input.toBranchId);
    const items = await prepareTransferItems(organizationId, input.items);
    const transfer = await prisma_1.prisma.stockTransfer.create({
        data: {
            organizationId,
            fromBranchId: input.fromBranchId,
            toBranchId: input.toBranchId,
            transferNumber: input.transferNumber ?? (0, numbering_1.generateDocumentNumber)("TR"),
            status: client_1.StockTransferStatus.DRAFT,
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
    await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(prisma_1.prisma, {
        organizationId,
        entityType: "StockTransfer",
        entityId: transfer.id,
        fields: [{ fieldKey: "notes", value: input.notes }],
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "StockTransfer",
        entityId: transfer.id,
        after: transfer,
    });
    return transfer;
}
async function getStockTransferById(organizationId, transferId) {
    const transfer = await prisma_1.prisma.stockTransfer.findFirst({
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
        throw ApiError_1.ApiError.notFound("Stock transfer not found");
    }
    return transfer;
}
async function updateStockTransfer(organizationId, transferId, actorUserId, input) {
    const existing = await getStockTransferById(organizationId, transferId);
    if (existing.status !== client_1.StockTransferStatus.DRAFT) {
        throw ApiError_1.ApiError.badRequest("Only draft transfers can be updated");
    }
    const fromBranchId = input.fromBranchId ?? existing.fromBranchId;
    const toBranchId = input.toBranchId ?? existing.toBranchId;
    if (fromBranchId === toBranchId) {
        throw ApiError_1.ApiError.badRequest("Source and destination branch cannot be same");
    }
    if (input.fromBranchId) {
        await (0, guards_1.assertBranchInOrg)(prisma_1.prisma, organizationId, input.fromBranchId);
    }
    if (input.toBranchId) {
        await (0, guards_1.assertBranchInOrg)(prisma_1.prisma, organizationId, input.toBranchId);
    }
    const items = input.items ? await prepareTransferItems(organizationId, input.items) : null;
    await prisma_1.prisma.$transaction(async (tx) => {
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
        await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(tx, {
            organizationId,
            entityType: "StockTransfer",
            entityId: transferId,
            fields: [{ fieldKey: "notes", value: input.notes ?? existing.notes }],
        });
    }, INTERACTIVE_TRANSACTION_OPTIONS);
    const updated = await getStockTransferById(organizationId, transferId);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "StockTransfer",
        entityId: updated.id,
        before: existing,
        after: updated,
    });
    return updated;
}
async function approveStockTransfer(organizationId, transferId, actorUserId) {
    const transfer = await getStockTransferById(organizationId, transferId);
    if (transfer.status !== client_1.StockTransferStatus.DRAFT) {
        throw ApiError_1.ApiError.badRequest("Only draft transfers can be approved");
    }
    if (transfer.fromBranchId === transfer.toBranchId) {
        throw ApiError_1.ApiError.badRequest("Source and destination branch cannot be same");
    }
    const approved = await prisma_1.prisma.$transaction(async (tx) => {
        // Bug fixed: this used to apply both stock movements per item FIRST and only write the
        // DRAFT -> APPROVED status change at the very end, with no re-check of status at write time
        // (the guard above only checked a snapshot read before the transaction even opened). Two
        // concurrent approve calls on the same DRAFT transfer (e.g. a staff member double-clicking
        // Approve, or two staff members approving the same transfer at once) would both pass that
        // stale check and both apply TRANSFER_OUT/TRANSFER_IN movements — physically moving the stock
        // TWICE for what the UI shows as a single transfer. Fixed the same way this module's sibling
        // sales-orders.service.ts already fixes the identical race for confirm/mark-ready/deliver: an
        // atomic `updateMany` claims the DRAFT -> APPROVED transition FIRST, so a second concurrent
        // caller's `updateMany` matches 0 rows and gets a conflict instead of also moving stock.
        const { count } = await tx.stockTransfer.updateMany({
            where: { id: transferId, organizationId, status: client_1.StockTransferStatus.DRAFT },
            data: {
                status: client_1.StockTransferStatus.APPROVED,
                approvedAt: new Date(),
                approvedById: actorUserId,
            },
        });
        if (count === 0) {
            throw ApiError_1.ApiError.conflict("Stock transfer is no longer draft — it may have already been approved or cancelled");
        }
        for (const item of transfer.items) {
            await (0, inventory_service_1.applyStockMovement)(tx, {
                organizationId,
                branchId: transfer.fromBranchId,
                variantId: item.variantId,
                movementType: client_1.StockMovementType.TRANSFER_OUT,
                referenceType: client_1.ReferenceType.STOCK_TRANSFER,
                referenceId: transfer.id,
                quantityDelta: (0, decimal_1.toDecimal)(item.quantity).negated(),
                unitCost: item.unitCost ?? undefined,
                note: transfer.notes ?? undefined,
                createdById: actorUserId,
            });
            await (0, inventory_service_1.applyStockMovement)(tx, {
                organizationId,
                branchId: transfer.toBranchId,
                variantId: item.variantId,
                movementType: client_1.StockMovementType.TRANSFER_IN,
                referenceType: client_1.ReferenceType.STOCK_TRANSFER,
                referenceId: transfer.id,
                quantityDelta: item.quantity,
                unitCost: item.unitCost ?? undefined,
                note: transfer.notes ?? undefined,
                createdById: actorUserId,
            });
        }
        const updated = await tx.stockTransfer.findUniqueOrThrow({ where: { id: transferId } });
        await (0, audit_service_1.createAuditLog)(tx, {
            organizationId,
            actorUserId,
            action: client_1.AuditAction.TRANSFER_APPROVE,
            entityType: "StockTransfer",
            entityId: transfer.id,
            before: transfer,
            after: updated,
        });
        return updated;
    }, INTERACTIVE_TRANSACTION_OPTIONS);
    return approved;
}
async function cancelStockTransfer(organizationId, transferId, actorUserId) {
    const transfer = await getStockTransferById(organizationId, transferId);
    if (transfer.status !== client_1.StockTransferStatus.DRAFT) {
        throw ApiError_1.ApiError.badRequest("Only draft transfers can be cancelled");
    }
    // Bug fixed: same TOCTOU race as approveStockTransfer above — this used to be an unconditional
    // update after only a pre-transaction status check. A cancel racing an approve (both reading
    // DRAFT before either write lands) could have this unconditional update overwrite an
    // already-APPROVED transfer — whose stock has already been physically moved between branches —
    // back to CANCELLED, leaving the record permanently misrepresenting a transfer that did happen.
    // Guarded with the same atomic-`updateMany`-then-conflict pattern used throughout this codebase.
    const { count } = await prisma_1.prisma.stockTransfer.updateMany({
        where: { id: transferId, organizationId, status: client_1.StockTransferStatus.DRAFT },
        data: {
            status: client_1.StockTransferStatus.CANCELLED,
        },
    });
    if (count === 0) {
        throw ApiError_1.ApiError.conflict("Stock transfer is no longer draft — it may have already been approved or cancelled");
    }
    const cancelled = await prisma_1.prisma.stockTransfer.findUniqueOrThrow({ where: { id: transferId } });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "StockTransfer",
        entityId: transfer.id,
        before: transfer,
        after: cancelled,
    });
    return cancelled;
}
