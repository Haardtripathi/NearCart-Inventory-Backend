"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDriverOrders = listDriverOrders;
exports.pickupDriverOrder = pickupDriverOrder;
exports.deliverDriverOrder = deliverDriverOrder;
exports.declineDriverOrder = declineDriverOrder;
exports.updateDriverAvailability = updateDriverAvailability;
exports.updateDriverLocation = updateDriverLocation;
exports.registerDriverDeviceTokenForDriver = registerDriverDeviceTokenForDriver;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const audit_service_1 = require("../audit/audit.service");
const order_event_webhook_service_1 = require("../../services/order-event-webhook.service");
const device_tokens_service_1 = require("../../services/device-tokens.service");
const sales_orders_service_1 = require("../sales-orders/sales-orders.service");
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
 * A driver declining an assignment before pickup — previously had no API-level path at all, only
 * a manager manually re-calling assign-driver with a different driver from the dashboard. Only
 * valid pre-pickup (status READY): once OUT_FOR_DELIVERY the driver already has the goods
 * physically in hand, which is a "return/reassign in person" problem, not a decline.
 *
 * Unassigns the declining driver and puts the order back to a bare READY/unassigned state, then
 * best-effort tries the same nearest-free-driver auto-match `markSalesOrderReady` uses so the
 * order doesn't just sit unassigned until a manager notices — same fire-and-forget posture as
 * that auto-assign call: a failure here must never turn a successful decline into an error
 * response.
 */
async function declineDriverOrder(driverId, orderId) {
    const order = await findAssignedOrder(driverId, orderId);
    if (order.status !== client_1.SalesOrderStatus.READY) {
        throw ApiError_1.ApiError.badRequest("Only orders that are READY (not yet picked up) can be declined");
    }
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        const { count } = await tx.salesOrder.updateMany({
            where: { id: orderId, assignedDriverId: driverId, status: client_1.SalesOrderStatus.READY },
            data: {
                assignedDriverId: null,
                assignedById: null,
                assignedAt: null,
            },
        });
        if (count === 0) {
            throw ApiError_1.ApiError.conflict("Order is no longer assigned to you — it may have already changed state");
        }
        const result = await tx.salesOrder.findUniqueOrThrow({
            where: { id: orderId },
            include: { items: true, branch: true, customer: true, organization: true },
        });
        await (0, audit_service_1.createAuditLog)(tx, {
            organizationId: order.organizationId,
            action: client_1.AuditAction.ORDER_DRIVER_DECLINE,
            entityType: "SalesOrder",
            entityId: order.id,
            before: { status: order.status, assignedDriverId: driverId },
            after: { status: result.status, assignedDriverId: null },
            meta: { driverId },
        });
        return result;
    });
    try {
        const nearestDriver = await (0, sales_orders_service_1.findNearestFreeDriver)(updated.branchId, driverId);
        if (nearestDriver) {
            await (0, sales_orders_service_1.assignDriverToSalesOrder)(updated.organizationId, updated.id, null, nearestDriver.id);
            // assignDriverToSalesOrder's own return shape doesn't include `organization`, which
            // serializeDriverOrder requires — re-fetch with the same include set the rest of this
            // file uses (see pickupDriverOrder/deliverDriverOrder) rather than widening that
            // function's include just for this one caller.
            const reassigned = await prisma_1.prisma.salesOrder.findUniqueOrThrow({
                where: { id: updated.id },
                include: { items: true, branch: true, customer: true, organization: true },
            });
            return serializeDriverOrder(reassigned);
        }
    }
    catch (error) {
        console.warn(`[driver-orders] Re-assignment after decline failed for order ${updated.id}`, error);
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
