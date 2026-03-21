"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSalesOrders = listSalesOrders;
exports.createSalesOrder = createSalesOrder;
exports.getSalesOrderById = getSalesOrderById;
exports.updateSalesOrder = updateSalesOrder;
exports.confirmSalesOrder = confirmSalesOrder;
exports.rejectSalesOrder = rejectSalesOrder;
exports.cancelSalesOrder = cancelSalesOrder;
exports.deliverSalesOrder = deliverSalesOrder;
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
async function prepareSalesOrderItems(organizationId, items) {
    let subtotal = (0, decimal_1.toDecimal)(0);
    let taxTotal = (0, decimal_1.toDecimal)(0);
    let discountTotal = (0, decimal_1.toDecimal)(0);
    let total = (0, decimal_1.toDecimal)(0);
    const preparedItems = [];
    for (const item of items) {
        const variant = await (0, guards_1.assertVariantInOrg)(prisma_1.prisma, organizationId, item.variantId);
        if (variant.productId !== item.productId) {
            throw ApiError_1.ApiError.badRequest("Sales order item productId does not match the selected variant");
        }
        const quantity = (0, decimal_1.toDecimal)(item.quantity);
        const unitPrice = (0, decimal_1.toDecimal)(item.unitPrice ?? variant.sellingPrice);
        const taxRate = (0, decimal_1.toDecimal)(item.taxRate ?? 0);
        const discountAmount = (0, decimal_1.toDecimal)(item.discountAmount ?? 0);
        if (quantity.lessThanOrEqualTo(0)) {
            throw ApiError_1.ApiError.badRequest("Sales quantities must be positive");
        }
        if (unitPrice.isNegative()) {
            throw ApiError_1.ApiError.badRequest("Unit price cannot be negative");
        }
        const lineBase = quantity.mul(unitPrice);
        const taxAmount = lineBase.mul(taxRate).div(100);
        const lineTotal = lineBase.minus(discountAmount).plus(taxAmount);
        subtotal = subtotal.plus(lineBase);
        taxTotal = taxTotal.plus(taxAmount);
        discountTotal = discountTotal.plus(discountAmount);
        total = total.plus(lineTotal);
        preparedItems.push({
            productId: item.productId,
            variantId: item.variantId,
            productNameSnapshot: variant.product.name,
            variantNameSnapshot: variant.name,
            skuSnapshot: variant.sku,
            quantity,
            unitPrice,
            taxRate,
            taxAmount,
            discountAmount,
            lineTotal,
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
const EDITABLE_ORDER_STATUSES = [client_1.SalesOrderStatus.DRAFT, client_1.SalesOrderStatus.PENDING];
const DELIVERED_OR_RETURNED_STATUSES = [
    client_1.SalesOrderStatus.DELIVERED,
    client_1.SalesOrderStatus.RETURNED,
];
const CLOSED_ORDER_STATUSES = [client_1.SalesOrderStatus.CANCELLED, client_1.SalesOrderStatus.REJECTED];
const CANCELLABLE_STOCK_REVERSAL_STATUSES = [
    client_1.SalesOrderStatus.CONFIRMED,
    client_1.SalesOrderStatus.READY,
    client_1.SalesOrderStatus.OUT_FOR_DELIVERY,
];
const DELIVERABLE_ORDER_STATUSES = [
    client_1.SalesOrderStatus.CONFIRMED,
    client_1.SalesOrderStatus.READY,
    client_1.SalesOrderStatus.OUT_FOR_DELIVERY,
];
function ensureEditableStatus(status) {
    if (!EDITABLE_ORDER_STATUSES.includes(status)) {
        throw ApiError_1.ApiError.badRequest("Only draft or pending sales orders can be edited");
    }
}
async function listSalesOrders(organizationId, query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(query.search
            ? {
                OR: [
                    { orderNumber: { contains: query.search, mode: "insensitive" } },
                    { customer: { name: { contains: query.search, mode: "insensitive" } } },
                ],
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.salesOrder.findMany({
            where,
            include: {
                branch: true,
                customer: true,
            },
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take: limit,
        }),
        prisma_1.prisma.salesOrder.count({ where }),
    ]);
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createSalesOrder(organizationId, actorUserId, input) {
    await (0, guards_1.assertBranchInOrg)(prisma_1.prisma, organizationId, input.branchId);
    if (input.customerId) {
        await (0, guards_1.assertCustomerInOrg)(prisma_1.prisma, organizationId, input.customerId);
    }
    const prepared = await prepareSalesOrderItems(organizationId, input.items);
    const order = await prisma_1.prisma.salesOrder.create({
        data: {
            organizationId,
            branchId: input.branchId,
            customerId: input.customerId ?? null,
            orderNumber: input.orderNumber ?? (0, numbering_1.generateDocumentNumber)("SO"),
            source: input.source ?? client_1.OrderSource.APP,
            status: input.status ?? client_1.SalesOrderStatus.PENDING,
            paymentStatus: input.paymentStatus ?? client_1.PaymentStatus.UNPAID,
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
            branch: true,
            customer: true,
        },
    });
    await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(prisma_1.prisma, {
        organizationId,
        entityType: "SalesOrder",
        entityId: order.id,
        fields: [{ fieldKey: "notes", value: input.notes }],
    });
    for (const item of order.items) {
        await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(prisma_1.prisma, {
            organizationId,
            entityType: "SalesOrderItem",
            entityId: item.id,
            fields: [
                { fieldKey: "productNameSnapshot", value: item.productNameSnapshot },
                { fieldKey: "variantNameSnapshot", value: item.variantNameSnapshot },
            ],
        });
    }
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "SalesOrder",
        entityId: order.id,
        after: order,
    });
    return order;
}
async function getSalesOrderById(organizationId, orderId) {
    const order = await prisma_1.prisma.salesOrder.findFirst({
        where: {
            id: orderId,
            organizationId,
        },
        include: {
            branch: true,
            customer: true,
            items: {
                include: {
                    product: true,
                    variant: true,
                },
            },
        },
    });
    if (!order) {
        throw ApiError_1.ApiError.notFound("Sales order not found");
    }
    return order;
}
async function updateSalesOrder(organizationId, orderId, actorUserId, input) {
    const existing = await getSalesOrderById(organizationId, orderId);
    ensureEditableStatus(existing.status);
    if (input.branchId) {
        await (0, guards_1.assertBranchInOrg)(prisma_1.prisma, organizationId, input.branchId);
    }
    if (input.customerId) {
        await (0, guards_1.assertCustomerInOrg)(prisma_1.prisma, organizationId, input.customerId);
    }
    if (input.status && !EDITABLE_ORDER_STATUSES.includes(input.status)) {
        throw ApiError_1.ApiError.badRequest("Only DRAFT or PENDING are allowed in update flow");
    }
    const prepared = input.items ? await prepareSalesOrderItems(organizationId, input.items) : null;
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.salesOrder.update({
            where: { id: orderId },
            data: {
                ...(input.branchId ? { branchId: input.branchId } : {}),
                ...(input.customerId !== undefined ? { customerId: input.customerId || null } : {}),
                ...(input.source ? { source: input.source } : {}),
                ...(input.status ? { status: input.status } : {}),
                ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
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
            await tx.salesOrderItem.deleteMany({
                where: {
                    salesOrderId: orderId,
                },
            });
            await tx.salesOrderItem.createMany({
                data: prepared.items.map((item) => ({
                    salesOrderId: orderId,
                    ...item,
                })),
            });
        }
        await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(tx, {
            organizationId,
            entityType: "SalesOrder",
            entityId: orderId,
            fields: [{ fieldKey: "notes", value: input.notes ?? existing.notes }],
        });
    });
    const updated = await getSalesOrderById(organizationId, orderId);
    for (const item of updated.items) {
        await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(prisma_1.prisma, {
            organizationId,
            entityType: "SalesOrderItem",
            entityId: item.id,
            fields: [
                { fieldKey: "productNameSnapshot", value: item.productNameSnapshot },
                { fieldKey: "variantNameSnapshot", value: item.variantNameSnapshot },
            ],
        });
    }
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "SalesOrder",
        entityId: updated.id,
        before: existing,
        after: updated,
    });
    return updated;
}
async function confirmSalesOrder(organizationId, orderId, actorUserId) {
    const order = await getSalesOrderById(organizationId, orderId);
    if (order.status === client_1.SalesOrderStatus.CONFIRMED) {
        throw ApiError_1.ApiError.badRequest("Sales order is already confirmed");
    }
    if (!EDITABLE_ORDER_STATUSES.includes(order.status)) {
        throw ApiError_1.ApiError.badRequest("Only draft or pending orders can be confirmed");
    }
    const confirmed = await prisma_1.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
            await (0, inventory_service_1.applyStockMovement)(tx, {
                organizationId,
                branchId: order.branchId,
                variantId: item.variantId,
                movementType: client_1.StockMovementType.SALE,
                referenceType: client_1.ReferenceType.SALES_ORDER,
                referenceId: order.id,
                quantityDelta: (0, decimal_1.toDecimal)(item.quantity).negated(),
                unitCost: item.variant.costPrice,
                note: order.notes ?? undefined,
                createdById: actorUserId,
            });
        }
        const updated = await tx.salesOrder.update({
            where: { id: orderId },
            data: {
                status: client_1.SalesOrderStatus.CONFIRMED,
                confirmedAt: new Date(),
                confirmedById: actorUserId,
            },
            include: {
                items: true,
                branch: true,
                customer: true,
            },
        });
        await (0, audit_service_1.createAuditLog)(tx, {
            organizationId,
            actorUserId,
            action: client_1.AuditAction.ORDER_CONFIRM,
            entityType: "SalesOrder",
            entityId: order.id,
            before: order,
            after: updated,
        });
        return updated;
    });
    return confirmed;
}
async function rejectSalesOrder(organizationId, orderId, actorUserId, rejectionReason) {
    const order = await getSalesOrderById(organizationId, orderId);
    if (DELIVERED_OR_RETURNED_STATUSES.includes(order.status)) {
        throw ApiError_1.ApiError.badRequest("Delivered or returned orders cannot be rejected");
    }
    if (!EDITABLE_ORDER_STATUSES.includes(order.status)) {
        throw ApiError_1.ApiError.badRequest("Only draft or pending orders can be rejected");
    }
    const updated = await prisma_1.prisma.salesOrder.update({
        where: { id: orderId },
        data: {
            status: client_1.SalesOrderStatus.REJECTED,
            rejectionReason,
        },
    });
    await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(prisma_1.prisma, {
        organizationId,
        entityType: "SalesOrder",
        entityId: updated.id,
        fields: [{ fieldKey: "rejectionReason", value: rejectionReason }],
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.ORDER_REJECT,
        entityType: "SalesOrder",
        entityId: updated.id,
        before: order,
        after: updated,
    });
    return updated;
}
async function cancelSalesOrder(organizationId, orderId, actorUserId) {
    const order = await getSalesOrderById(organizationId, orderId);
    if (CLOSED_ORDER_STATUSES.includes(order.status)) {
        throw ApiError_1.ApiError.badRequest("Order is already closed");
    }
    if (DELIVERED_OR_RETURNED_STATUSES.includes(order.status)) {
        throw ApiError_1.ApiError.badRequest("Delivered or returned orders cannot be cancelled in this flow");
    }
    const cancelled = await prisma_1.prisma.$transaction(async (tx) => {
        if (CANCELLABLE_STOCK_REVERSAL_STATUSES.includes(order.status)) {
            for (const item of order.items) {
                await (0, inventory_service_1.applyStockMovement)(tx, {
                    organizationId,
                    branchId: order.branchId,
                    variantId: item.variantId,
                    movementType: client_1.StockMovementType.SALE_CANCEL,
                    referenceType: client_1.ReferenceType.SALES_ORDER,
                    referenceId: order.id,
                    quantityDelta: item.quantity,
                    unitCost: item.variant.costPrice,
                    note: "Sales order cancelled",
                    createdById: actorUserId,
                });
            }
        }
        const updated = await tx.salesOrder.update({
            where: { id: orderId },
            data: {
                status: client_1.SalesOrderStatus.CANCELLED,
            },
        });
        await (0, audit_service_1.createAuditLog)(tx, {
            organizationId,
            actorUserId,
            action: client_1.AuditAction.UPDATE,
            entityType: "SalesOrder",
            entityId: order.id,
            before: order,
            after: updated,
        });
        return updated;
    });
    return cancelled;
}
async function deliverSalesOrder(organizationId, orderId, actorUserId) {
    const order = await getSalesOrderById(organizationId, orderId);
    if (order.status === client_1.SalesOrderStatus.DELIVERED) {
        throw ApiError_1.ApiError.badRequest("Sales order is already delivered");
    }
    if (!DELIVERABLE_ORDER_STATUSES.includes(order.status)) {
        throw ApiError_1.ApiError.badRequest("Only confirmed orders can be delivered");
    }
    const updated = await prisma_1.prisma.salesOrder.update({
        where: { id: orderId },
        data: {
            status: client_1.SalesOrderStatus.DELIVERED,
            deliveredAt: new Date(),
            deliveredById: actorUserId,
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.ORDER_DELIVER,
        entityType: "SalesOrder",
        entityId: updated.id,
        before: order,
        after: updated,
    });
    return updated;
}
