"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDriverOrders = listDriverOrders;
exports.pickupDriverOrder = pickupDriverOrder;
exports.deliverDriverOrder = deliverDriverOrder;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const audit_service_1 = require("../audit/audit.service");
const DRIVER_VISIBLE_STATUSES = [client_1.SalesOrderStatus.READY, client_1.SalesOrderStatus.OUT_FOR_DELIVERY];
function serializeDriverOrder(order) {
    return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        notes: order.notes,
        total: order.total,
        organization: {
            id: order.organization.id,
            name: order.organization.name,
            phone: order.organization.phone,
        },
        branch: {
            id: order.branch.id,
            name: order.branch.name,
            phone: order.branch.phone,
            addressLine1: order.branch.addressLine1,
            addressLine2: order.branch.addressLine2,
            city: order.branch.city,
            state: order.branch.state,
            postalCode: order.branch.postalCode,
        },
        customer: order.customer
            ? {
                name: order.customer.name,
                phone: order.customer.phone,
            }
            : null,
        // Delivery address / lat-long (when available) is whatever shape the order-creating flow
        // stored on the customer record — this schema has no dedicated SalesOrder delivery-address
        // field, so the customer's address JSON is forwarded as-is.
        deliveryAddress: order.customer?.address ?? null,
        items: order.items.map((item) => ({
            productName: item.productNameSnapshot,
            variantName: item.variantNameSnapshot,
            sku: item.skuSnapshot,
            quantity: item.quantity,
        })),
        assignedAt: order.assignedAt,
        readyAt: order.readyAt,
        pickedUpAt: order.pickedUpAt,
        deliveredAt: order.deliveredAt,
    };
}
async function findAssignedOrder(driverId, orderId) {
    const order = await prisma_1.prisma.salesOrder.findFirst({
        where: {
            id: orderId,
            assignedDriverId: driverId,
        },
        include: {
            items: true,
            branch: true,
            customer: true,
            organization: true,
        },
    });
    if (!order) {
        throw ApiError_1.ApiError.notFound("Order not found or not assigned to you");
    }
    return order;
}
async function listDriverOrders(driverId) {
    const orders = await prisma_1.prisma.salesOrder.findMany({
        where: {
            assignedDriverId: driverId,
            status: { in: DRIVER_VISIBLE_STATUSES },
        },
        include: {
            items: true,
            branch: true,
            customer: true,
            organization: true,
        },
        orderBy: {
            assignedAt: "asc",
        },
    });
    return orders.map((order) => serializeDriverOrder(order));
}
async function pickupDriverOrder(driverId, orderId) {
    const order = await findAssignedOrder(driverId, orderId);
    if (order.status !== client_1.SalesOrderStatus.READY) {
        throw ApiError_1.ApiError.badRequest("Only orders that are READY can be picked up");
    }
    const updated = await prisma_1.prisma.salesOrder.update({
        where: { id: orderId },
        data: {
            status: client_1.SalesOrderStatus.OUT_FOR_DELIVERY,
            pickedUpAt: new Date(),
        },
        include: {
            items: true,
            branch: true,
            customer: true,
            organization: true,
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId: order.organizationId,
        action: client_1.AuditAction.ORDER_PICKUP,
        entityType: "SalesOrder",
        entityId: order.id,
        before: { status: order.status },
        after: { status: updated.status, pickedUpAt: updated.pickedUpAt },
        meta: { driverId },
    });
    return serializeDriverOrder(updated);
}
async function deliverDriverOrder(driverId, orderId) {
    const order = await findAssignedOrder(driverId, orderId);
    if (order.status !== client_1.SalesOrderStatus.OUT_FOR_DELIVERY) {
        throw ApiError_1.ApiError.badRequest("Only orders that are OUT_FOR_DELIVERY can be marked delivered");
    }
    const updated = await prisma_1.prisma.salesOrder.update({
        where: { id: orderId },
        data: {
            status: client_1.SalesOrderStatus.DELIVERED,
            deliveredAt: new Date(),
        },
        include: {
            items: true,
            branch: true,
            customer: true,
            organization: true,
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId: order.organizationId,
        action: client_1.AuditAction.ORDER_DELIVER,
        entityType: "SalesOrder",
        entityId: order.id,
        before: { status: order.status },
        after: { status: updated.status, deliveredAt: updated.deliveredAt },
        meta: { driverId },
    });
    return serializeDriverOrder(updated);
}
