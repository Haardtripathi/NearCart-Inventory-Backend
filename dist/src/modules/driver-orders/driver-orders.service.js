"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDriverOrders = listDriverOrders;
exports.pickupDriverOrder = pickupDriverOrder;
exports.deliverDriverOrder = deliverDriverOrder;
exports.updateDriverAvailability = updateDriverAvailability;
exports.updateDriverLocation = updateDriverLocation;
exports.registerDriverDeviceTokenForDriver = registerDriverDeviceTokenForDriver;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const audit_service_1 = require("../audit/audit.service");
const order_event_webhook_service_1 = require("../../services/order-event-webhook.service");
const device_tokens_service_1 = require("../../services/device-tokens.service");
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
        // Structured `{ addressLine, latitude, longitude }` populated at bridge order-creation time
        // (see marketplace.service.ts createBridgedSalesOrder). Falls back to the customer's generic
        // address only for pre-migration rows where deliveryAddress is still null — the customer's
        // address can be stale/wrong for a repeat customer ordering somewhere new, so this fallback
        // is a courtesy for old data, not the primary source going forward.
        deliveryAddress: order.deliveryAddress ?? order.customer?.address ?? null,
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
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        // Guard against two concurrent pickup calls for the same order (e.g. a flaky mobile client
        // retrying the request): the WHERE clause's status + assignedDriverId checks are evaluated
        // atomically by Postgres as part of the UPDATE, so only the first caller can win.
        const { count } = await tx.salesOrder.updateMany({
            where: { id: orderId, assignedDriverId: driverId, status: client_1.SalesOrderStatus.READY },
            data: {
                status: client_1.SalesOrderStatus.OUT_FOR_DELIVERY,
                pickedUpAt: new Date(),
            },
        });
        if (count === 0) {
            throw ApiError_1.ApiError.conflict("Order is no longer READY — it may have already been picked up");
        }
        const result = await tx.salesOrder.findUniqueOrThrow({
            where: { id: orderId },
            include: {
                items: true,
                branch: true,
                customer: true,
                organization: true,
            },
        });
        await (0, audit_service_1.createAuditLog)(tx, {
            organizationId: order.organizationId,
            action: client_1.AuditAction.ORDER_PICKUP,
            entityType: "SalesOrder",
            entityId: order.id,
            before: { status: order.status },
            after: { status: result.status, pickedUpAt: result.pickedUpAt },
            meta: { driverId },
        });
        return result;
    });
    if (updated.externalOrderId) {
        void (0, order_event_webhook_service_1.notifyOrderEvent)({
            externalOrderId: updated.externalOrderId,
            status: updated.status,
            eventType: "OUT_FOR_DELIVERY",
        });
    }
    return serializeDriverOrder(updated);
}
async function deliverDriverOrder(driverId, orderId) {
    const order = await findAssignedOrder(driverId, orderId);
    if (order.status !== client_1.SalesOrderStatus.OUT_FOR_DELIVERY) {
        throw ApiError_1.ApiError.badRequest("Only orders that are OUT_FOR_DELIVERY can be marked delivered");
    }
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        // Guard against two concurrent deliver calls for the same order — see pickupDriverOrder
        // above for the same pattern/rationale.
        const { count } = await tx.salesOrder.updateMany({
            where: { id: orderId, assignedDriverId: driverId, status: client_1.SalesOrderStatus.OUT_FOR_DELIVERY },
            data: {
                status: client_1.SalesOrderStatus.DELIVERED,
                deliveredAt: new Date(),
            },
        });
        if (count === 0) {
            throw ApiError_1.ApiError.conflict("Order is no longer OUT_FOR_DELIVERY — it may have already been delivered");
        }
        const result = await tx.salesOrder.findUniqueOrThrow({
            where: { id: orderId },
            include: {
                items: true,
                branch: true,
                customer: true,
                organization: true,
            },
        });
        await (0, audit_service_1.createAuditLog)(tx, {
            organizationId: order.organizationId,
            action: client_1.AuditAction.ORDER_DELIVER,
            entityType: "SalesOrder",
            entityId: order.id,
            before: { status: order.status },
            after: { status: result.status, deliveredAt: result.deliveredAt },
            meta: { driverId },
        });
        return result;
    });
    if (updated.externalOrderId) {
        void (0, order_event_webhook_service_1.notifyOrderEvent)({
            externalOrderId: updated.externalOrderId,
            status: updated.status,
            eventType: "DELIVERED",
        });
    }
    return serializeDriverOrder(updated);
}
/**
 * Toggles a driver's own "online/offline" availability for nearest-free-driver auto-assignment
 * (see sales-orders.service.ts's findNearestFreeDriver). Going offline does NOT unassign any
 * order already in progress — it only takes the driver out of consideration for *future*
 * auto-matches.
 */
async function updateDriverAvailability(driverId, isAvailableForAssignment) {
    return prisma_1.prisma.driver.update({
        where: { id: driverId },
        data: { isAvailableForAssignment },
        select: { id: true, isAvailableForAssignment: true },
    });
}
/**
 * Records a driver's current position for nearest-free-driver matching. Called roughly once a
 * minute by the driver app's foreground `setInterval`, only while the driver is toggled online —
 * deliberately NOT continuous background tracking (Phase 1 explicitly defers live tracking, see
 * root plan doc).
 */
async function updateDriverLocation(driverId, latitude, longitude) {
    return prisma_1.prisma.driver.update({
        where: { id: driverId },
        data: {
            lastKnownLatitude: latitude,
            lastKnownLongitude: longitude,
            lastLocationAt: new Date(),
        },
        select: { id: true, lastKnownLatitude: true, lastKnownLongitude: true, lastLocationAt: true },
    });
}
async function registerDriverDeviceTokenForDriver(driverId, input) {
    return (0, device_tokens_service_1.upsertDeviceToken)("DRIVER", driverId, input);
}
