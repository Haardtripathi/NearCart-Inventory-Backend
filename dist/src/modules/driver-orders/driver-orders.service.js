"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDriverOrders = listDriverOrders;
exports.arriveDriverOrder = arriveDriverOrder;
exports.pickupDriverOrder = pickupDriverOrder;
exports.deliverDriverOrder = deliverDriverOrder;
exports.declineDriverOrder = declineDriverOrder;
exports.updateDriverAvailability = updateDriverAvailability;
exports.updateDriverLocation = updateDriverLocation;
exports.registerDriverDeviceTokenForDriver = registerDriverDeviceTokenForDriver;
exports.listDriverOrderHistory = listDriverOrderHistory;
exports.getDriverEarningsSummary = getDriverEarningsSummary;
exports.getDriverPerformanceSummary = getDriverPerformanceSummary;
const client_1 = require("@prisma/client");
const env_1 = require("../../config/env");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const audit_service_1 = require("../audit/audit.service");
const order_event_webhook_service_1 = require("../../services/order-event-webhook.service");
const push_notification_service_1 = require("../../services/push-notification.service");
const device_tokens_service_1 = require("../../services/device-tokens.service");
const uploads_service_1 = require("../uploads/uploads.service");
const notifications_service_1 = require("../notifications/notifications.service");
const sales_orders_service_1 = require("../sales-orders/sales-orders.service");
const DRIVER_VISIBLE_STATUSES = [client_1.SalesOrderStatus.READY, client_1.SalesOrderStatus.OUT_FOR_DELIVERY];
function serializeDriverOrder(order) {
    return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        notes: order.notes,
        total: order.total,
        // Distance-based driver fare for this specific delivery, computed at mark-ready time (see
        // computeDriverFare/markSalesOrderReady in sales-orders.service.ts). Both null for orders that
        // predate the feature or whose branch/deliveryAddress coordinates were missing — client apps
        // should treat a null driverDeliveryFee as "fare unavailable for this order", not zero.
        estimatedDistanceKm: order.estimatedDistanceKm,
        driverDeliveryFee: order.driverDeliveryFee != null ? Number(order.driverDeliveryFee) : null,
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
            // Pickup-point coordinates for the driver app's map screen — see Branch.latitude/longitude
            // doc comment. Nullable for branches that predate that column / never had it backfilled.
            latitude: order.branch.latitude,
            longitude: order.branch.longitude,
            // Cloudinary URL from the branch's compulsory shop-photo verification (see
            // Branch.shopPhotoUrl doc comment) — was captured on the shop-owner side but never
            // forwarded to either driver client, so both apps fell back to a generic building icon
            // regardless of whether a real photo existed. Nullable for branches that predate/skipped
            // verification.
            shopPhotoUrl: order.branch.shopPhotoUrl,
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
        arrivedForPickupAt: order.arrivedForPickupAt,
        pickedUpAt: order.pickedUpAt,
        deliveredAt: order.deliveredAt,
        deliveryProofPhotoUrl: order.deliveryProofPhotoUrl,
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
/**
 * POST /driver/orders/:id/arrived — new feature (2026-08-07 cross-app fix round, contract locked
 * against a client agent building the corresponding driver-app UI in parallel): the assigned
 * driver confirms they've physically reached the branch/pickup point, before pickup. Only valid
 * from READY (assigned, not yet picked up) and only once per order — a second call (or a call
 * before pickup precondition is met) is a clean 400, not silently ignored, so a retrying client
 * gets an unambiguous signal rather than looking like it worked twice.
 */
async function arriveDriverOrder(driverId, orderId) {
    const order = await findAssignedOrder(driverId, orderId);
    if (order.status !== client_1.SalesOrderStatus.READY) {
        throw ApiError_1.ApiError.badRequest("Only orders that are READY (assigned but not yet picked up) can be marked arrived");
    }
    if (order.arrivedForPickupAt) {
        throw ApiError_1.ApiError.badRequest("Arrival for this order has already been recorded");
    }
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        // Same atomic-updateMany-then-conflict pattern as pickupDriverOrder/deliverDriverOrder above —
        // closes the same "two concurrent calls" race, plus doubles as the re-check against a
        // just-recorded arrival (arrivedForPickupAt: null in the WHERE) so two racing calls can't both
        // "succeed".
        const { count } = await tx.salesOrder.updateMany({
            where: {
                id: orderId,
                assignedDriverId: driverId,
                status: client_1.SalesOrderStatus.READY,
                arrivedForPickupAt: null,
            },
            data: {
                arrivedForPickupAt: new Date(),
            },
        });
        if (count === 0) {
            throw ApiError_1.ApiError.conflict("Order is no longer eligible for an arrival update — it may have changed state or already been marked arrived");
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
            action: client_1.AuditAction.ORDER_DRIVER_ARRIVED,
            entityType: "SalesOrder",
            entityId: order.id,
            before: { arrivedForPickupAt: null },
            after: { arrivedForPickupAt: result.arrivedForPickupAt },
            meta: { driverId },
        });
        return result;
    });
    // Staff-facing alert, same record+push pattern as every other org-staff notification in this
    // codebase (see marketplace.service.ts's NEW_ORDER handling / sales-orders.service.ts's
    // notifyStaffOfAutoAssignFailure) — fire-and-forget, a failure here must never fail the arrival
    // update itself, which has already committed by this point.
    const title = "Driver arrived for pickup";
    const body = `Driver has arrived for pickup — Order #${updated.orderNumber}.`;
    const notificationData = { salesOrderId: updated.id, driverId };
    void (0, push_notification_service_1.sendPushToOrgStaff)(updated.organizationId, {
        title,
        body,
        data: notificationData,
        channelId: "order_alert",
    }).catch((error) => {
        console.warn(`[driver-orders] Failed to push driver-arrived alert to org staff for order ${updated.id}`, error);
    });
    void (0, notifications_service_1.recordNotificationLog)(prisma_1.prisma, {
        organizationId: updated.organizationId,
        type: client_1.NotificationLogType.ORDER_DRIVER_ARRIVED,
        title,
        body,
        data: notificationData,
    }).catch((error) => {
        console.warn(`[driver-orders] Failed to record driver-arrived notification log for order ${updated.id}`, error);
    });
    return serializeDriverOrder(updated);
}
async function pickupDriverOrder(driverId, orderId) {
    const order = await findAssignedOrder(driverId, orderId);
    if (order.status !== client_1.SalesOrderStatus.READY) {
        throw ApiError_1.ApiError.badRequest("Only orders that are READY can be picked up");
    }
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        // Guard against two concurrent pickup calls for the same order (e.g. a flaky mobile client
        // retrying the request): the WHERE clause's status + assignedDriverId checks are evaluated
        // atomically as part of the single UPDATE statement (true on SQLite/libSQL just as it was on
        // Postgres pre-migration — see sales-orders.service.ts's assignDriverToSalesOrder for the
        // fuller writeup of why a single atomic UPDATE, not a row lock, is what actually closes this
        // race on this engine), so only the first caller can win.
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
/**
 * `photo`, when provided, is a delivery-proof snapshot captured by the driver app right before
 * confirming drop-off — uploaded to Cloudinary BEFORE the transaction below (an external network
 * call has no business holding a DB transaction open), so a failed upload throws and the order
 * simply stays OUT_FOR_DELIVERY, same as any other pre-transaction failure. Optional: a driver
 * without a working camera/upload still needs to be able to mark an order delivered, so this
 * never blocks the status transition itself.
 */
async function deliverDriverOrder(driverId, orderId, photo) {
    const order = await findAssignedOrder(driverId, orderId);
    if (order.status !== client_1.SalesOrderStatus.OUT_FOR_DELIVERY) {
        throw ApiError_1.ApiError.badRequest("Only orders that are OUT_FOR_DELIVERY can be marked delivered");
    }
    let deliveryProofPhotoUrl;
    if (photo) {
        const upload = await (0, uploads_service_1.uploadImageToCloudinary)({
            fileBuffer: photo.buffer,
            originalFilename: photo.originalname,
            scope: "general",
            ownerId: `driver-${driverId}`,
        });
        deliveryProofPhotoUrl = upload.url;
    }
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        // Guard against two concurrent deliver calls for the same order — see pickupDriverOrder
        // above for the same pattern/rationale.
        const { count } = await tx.salesOrder.updateMany({
            where: { id: orderId, assignedDriverId: driverId, status: client_1.SalesOrderStatus.OUT_FOR_DELIVERY },
            data: {
                status: client_1.SalesOrderStatus.DELIVERED,
                deliveredAt: new Date(),
                ...(deliveryProofPhotoUrl
                    ? { deliveryProofPhotoUrl, deliveryProofPhotoAt: new Date() }
                    : {}),
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
            // See NotifyOrderEventInput's doc comment — lets NearCart show the same delivery-proof
            // photo shop staff see, when the driver attached one.
            deliveryProofPhotoUrl: updated.deliveryProofPhotoUrl,
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
 *
 * Bug fixed 2026-08-07 (E2E_SCENARIOS_FAILURE_EDGECASES.md C5): this used to only exclude the
 * CURRENT decliner from the immediate re-match (`findNearestFreeDriver(branchId, driverId)`), with
 * no memory of anyone who'd declined this order previously. With 2+ drivers online, that let an
 * order ping-pong indefinitely between them (A declines -> B; B declines -> A is free again, gets
 * re-matched to the exact order they already turned down). Now appends `driverId` to the order's
 * persisted `declinedByDriverIds` (see schema.prisma) and excludes the FULL accumulated set on
 * every re-match attempt, not just the latest decliner.
 */
async function declineDriverOrder(driverId, orderId) {
    const order = await findAssignedOrder(driverId, orderId);
    if (order.status !== client_1.SalesOrderStatus.READY) {
        throw ApiError_1.ApiError.badRequest("Only orders that are READY (not yet picked up) can be declined");
    }
    const declinedByDriverIds = Array.from(new Set([...(0, sales_orders_service_1.parseDeclinedDriverIds)(order.declinedByDriverIds), driverId]));
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        const { count } = await tx.salesOrder.updateMany({
            where: { id: orderId, assignedDriverId: driverId, status: client_1.SalesOrderStatus.READY },
            data: {
                assignedDriverId: null,
                assignedById: null,
                assignedAt: null,
                declinedByDriverIds,
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
            meta: { driverId, declinedByDriverIds },
        });
        return result;
    });
    try {
        const nearestDriver = await (0, sales_orders_service_1.findNearestFreeDriver)(updated.branchId, (0, sales_orders_service_1.parseDeclinedDriverIds)(updated.declinedByDriverIds));
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
    // No replacement driver found (or re-assignment attempt failed) — the order is back to
    // unassigned READY. Without this, NearCart never learns the assignment was reversed and keeps
    // showing the declining driver's stale name/phone on the order until some later event
    // overwrites it (see the matching DRIVER_UNASSIGNED branch added to NearCart's
    // applyInventoryOrderEvent). Fire-and-forget, same resilience posture as every other call here.
    if (updated.externalOrderId) {
        void (0, order_event_webhook_service_1.notifyOrderEvent)({
            externalOrderId: updated.externalOrderId,
            status: updated.status,
            eventType: "DRIVER_UNASSIGNED",
        });
    }
    // Bug fixed 2026-08-08 (bug-hunt sweep): this fallthrough — a decline whose re-match also found
    // no replacement driver — used to leave the order READY-and-unassigned with zero staff-facing
    // trace, same blind spot `notifyStaffOfAutoAssignFailure` was written to close for
    // `markSalesOrderReady`'s auto-assign path (see sales-orders.service.ts). That fix never got
    // wired up here even though a decline landing an order back in this exact state is arguably more
    // common in practice than the ready-time case. Same best-effort/never-throws posture as every
    // other call site — this must never turn a successful decline into an error response.
    void (0, sales_orders_service_1.notifyStaffOfAutoAssignFailure)(updated.organizationId, updated);
    return serializeDriverOrder(updated);
}
/**
 * Toggles a driver's own "online/offline" availability for nearest-free-driver auto-assignment
 * (see sales-orders.service.ts's findNearestFreeDriver). Going offline does NOT unassign any
 * order already in progress — it only takes the driver out of consideration for *future*
 * auto-matches.
 *
 * Fix (2026-08-07, E2E_SCENARIOS_FAILURE_EDGECASES.md C4): coming back online used to be a pure
 * no-op beyond the flag flip itself — any order that went READY while this driver (and every
 * other driver) was offline stayed unassigned forever unless a manager manually intervened, even
 * after a driver who could have taken it came back online. Now, on a false -> true transition
 * only, best-effort tries to match this driver to the single nearest eligible unassigned READY
 * order (see `findNearestUnassignedOrderForDriver`) — same fire-and-forget resilience posture as
 * every other auto-assign call site in this file: a failure here must never turn a successful
 * availability update into an error response.
 */
async function updateDriverAvailability(driverId, isAvailableForAssignment) {
    const updated = await prisma_1.prisma.driver.update({
        where: { id: driverId },
        data: { isAvailableForAssignment },
        select: {
            id: true,
            isAvailableForAssignment: true,
            lastKnownLatitude: true,
            lastKnownLongitude: true,
            lastLocationAt: true,
        },
    });
    // Bug found live 2026-08-09 (companion to the same fix in findNearestFreeDriver): a driver
    // toggling back online after their location ping went stale (app was dead/backgrounded for a
    // while, then they flip the switch without a fresh GPS fix landing first) used to still get
    // matched here off whatever coordinates were last recorded, however old. Skip the auto-match
    // attempt entirely when the location itself is stale — the driver stays online and eligible for
    // ordinary matching the moment their next location ping lands, same as any other online driver.
    const isLocationFresh = updated.lastLocationAt != null &&
        updated.lastLocationAt.getTime() >= Date.now() - env_1.env.DRIVER_LOCATION_STALE_MINUTES * 60_000;
    if (isAvailableForAssignment &&
        isLocationFresh &&
        updated.lastKnownLatitude != null &&
        updated.lastKnownLongitude != null) {
        try {
            const nearestOrder = await (0, sales_orders_service_1.findNearestUnassignedOrderForDriver)(driverId, {
                latitude: updated.lastKnownLatitude,
                longitude: updated.lastKnownLongitude,
            });
            if (nearestOrder) {
                const order = await prisma_1.prisma.salesOrder.findUnique({
                    where: { id: nearestOrder.id },
                    select: { organizationId: true },
                });
                if (order) {
                    await (0, sales_orders_service_1.assignDriverToSalesOrder)(order.organizationId, nearestOrder.id, null, driverId);
                }
            }
        }
        catch (error) {
            console.warn(`[driver-orders] Auto-match on driver ${driverId} coming back online failed`, error);
        }
    }
    return { id: updated.id, isAvailableForAssignment: updated.isAvailableForAssignment };
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
const DRIVER_HISTORY_PAGE_SIZE = 20;
/**
 * GET /driver/orders/history — DELIVERED orders assigned to the calling driver, newest first.
 * A separate call from GET /driver/orders (which only ever returns READY/OUT_FOR_DELIVERY, see
 * DRIVER_VISIBLE_STATUSES above) rather than widening that one, since the "active deliveries"
 * list and a "past deliveries" history feed have different UX needs (pagination here, none there).
 */
async function listDriverOrderHistory(driverId, page) {
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * DRIVER_HISTORY_PAGE_SIZE;
    const [orders, total] = await Promise.all([
        prisma_1.prisma.salesOrder.findMany({
            where: { assignedDriverId: driverId, status: client_1.SalesOrderStatus.DELIVERED },
            include: { items: true, branch: true, customer: true, organization: true },
            orderBy: { deliveredAt: "desc" },
            skip,
            take: DRIVER_HISTORY_PAGE_SIZE,
        }),
        prisma_1.prisma.salesOrder.count({
            where: { assignedDriverId: driverId, status: client_1.SalesOrderStatus.DELIVERED },
        }),
    ]);
    return {
        orders: orders.map((order) => serializeDriverOrder(order)),
        page: safePage,
        pageSize: DRIVER_HISTORY_PAGE_SIZE,
        total,
        hasMore: skip + orders.length < total,
    };
}
/** Midnight in the server's local timezone — good enough for a "today so far" cutoff without
 *  pulling in a timezone library for a single driver-facing dashboard. */
function startOfLocalDay(reference) {
    const start = new Date(reference);
    start.setHours(0, 0, 0, 0);
    return start;
}
function rangeStartDate(range, now) {
    const startOfToday = startOfLocalDay(now);
    switch (range) {
        case "today":
            return startOfToday;
        case "week": {
            // ISO-ish "last 7 days including today" rather than calendar-week-so-far — simpler and
            // matches what a driver actually wants to see ("how did the last week go").
            const start = new Date(startOfToday);
            start.setDate(start.getDate() - 6);
            return start;
        }
        case "month": {
            const start = new Date(startOfToday);
            start.setDate(start.getDate() - 29);
            return start;
        }
        case "all":
        default:
            return null;
    }
}
/**
 * Resolves a delivered order's actual driver payout: the real per-order `driverDeliveryFee`
 * persisted at mark-ready time (see computeDriverFare/markSalesOrderReady in
 * sales-orders.service.ts) when present, falling back to the flat `DRIVER_DELIVERY_FEE` env rate
 * for orders that predate that column or whose branch/deliveryAddress coordinates were missing so
 * no distance-based fare could be computed. Preserves historical earnings for those rows instead
 * of silently costing them at 0.
 */
function resolveDeliveryEarning(driverDeliveryFee) {
    return driverDeliveryFee != null ? Number(driverDeliveryFee) : env_1.env.DRIVER_DELIVERY_FEE;
}
/**
 * GET /driver/earnings/summary?range=today|week|month|all — computed entirely from data already
 * on hand (DELIVERED SalesOrder rows assigned to this driver), now using each order's real
 * persisted `driverDeliveryFee` (see resolveDeliveryEarning above) rather than a single flat rate
 * for every delivery. `perDay` is a small array (at most 30 entries for `month`) suitable for a
 * sparkline/bar chart on the driver app's earnings screen.
 */
async function getDriverEarningsSummary(driverId, range) {
    const now = new Date();
    const startDate = rangeStartDate(range, now);
    const deliveredOrders = await prisma_1.prisma.salesOrder.findMany({
        where: {
            assignedDriverId: driverId,
            status: client_1.SalesOrderStatus.DELIVERED,
            ...(startDate ? { deliveredAt: { gte: startDate } } : {}),
        },
        select: {
            id: true,
            orderNumber: true,
            deliveredAt: true,
            driverDeliveryFee: true,
            branch: { select: { name: true } },
        },
        orderBy: { deliveredAt: "desc" },
    });
    const perDayMap = new Map();
    let totalEarnings = 0;
    for (const order of deliveredOrders) {
        if (!order.deliveredAt)
            continue;
        const earning = resolveDeliveryEarning(order.driverDeliveryFee);
        totalEarnings += earning;
        const dateKey = order.deliveredAt.toISOString().slice(0, 10);
        const existing = perDayMap.get(dateKey) ?? { date: dateKey, deliveries: 0, earnings: 0 };
        existing.deliveries += 1;
        existing.earnings += earning;
        perDayMap.set(dateKey, existing);
    }
    const perDay = Array.from(perDayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    // Lifetime totals are summed from each order's real fee (same as the range totals above) rather
    // than kept as a lighter `count * flat-rate` query — the entire point of this feature is that
    // earnings reflect real per-order fares, and a lifetime figure that silently reverted to the old
    // flat-rate approximation would be a confusing inconsistency on the same screen as the accurate
    // range totals right above it. A driver's lifetime delivered-order count is small enough (one
    // person's real-world delivery history) that this findMany is not a performance concern; if that
    // ever changes, a raw-SQL `SUM(COALESCE(driverDeliveryFee, :fallback))` aggregate would be the
    // next step rather than reverting to the inaccurate count*constant shortcut.
    const lifetimeOrders = await prisma_1.prisma.salesOrder.findMany({
        where: { assignedDriverId: driverId, status: client_1.SalesOrderStatus.DELIVERED },
        select: { driverDeliveryFee: true },
    });
    const lifetimeTotalEarnings = lifetimeOrders.reduce((sum, order) => sum + resolveDeliveryEarning(order.driverDeliveryFee), 0);
    return {
        range,
        averageFeePerDelivery: deliveredOrders.length > 0 ? totalEarnings / deliveredOrders.length : 0,
        totalDeliveries: deliveredOrders.length,
        totalEarnings,
        perDay,
        recentDeliveries: deliveredOrders.slice(0, 10).map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            branchName: order.branch.name,
            deliveredAt: order.deliveredAt,
            earning: resolveDeliveryEarning(order.driverDeliveryFee),
        })),
        lifetime: {
            totalDeliveries: lifetimeOrders.length,
            totalEarnings: lifetimeTotalEarnings,
        },
    };
}
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/**
 * GET /driver/performance/summary?range=today|week|month|all — added for the driver app's Round 2
 * "weekly/monthly performance" screen. Deliberately does NOT report a rating: confirmed by reading
 * this file's schema (Driver/SalesOrder) that no rating field exists anywhere yet, so this sticks
 * to metrics derivable from timestamps already on SalesOrder (assignedAt/pickedUpAt/deliveredAt) —
 * average pickup-to-drop-off duration, a weekday breakdown, and a "days with at least one delivery"
 * streak — rather than inventing a fake rating number.
 *
 * `avgDeliveryMinutes`/`fastestDeliveryMinutes` are computed only from orders that have both
 * pickedUpAt and deliveredAt set (true for every order delivered through the normal pickup->deliver
 * flow; excludes any pre-migration or manually-edited row missing one of those). Streaks are
 * intentionally computed over the driver's ENTIRE delivery history, not clipped to `range` — a
 * "your current streak" stat that resets to 0 just because you picked "This week" would be
 * confusing, not useful.
 */
async function getDriverPerformanceSummary(driverId, range) {
    const now = new Date();
    const startDate = rangeStartDate(range, now);
    const [rangeOrders, allDeliveredDates] = await Promise.all([
        prisma_1.prisma.salesOrder.findMany({
            where: {
                assignedDriverId: driverId,
                status: client_1.SalesOrderStatus.DELIVERED,
                ...(startDate ? { deliveredAt: { gte: startDate } } : {}),
            },
            select: { pickedUpAt: true, deliveredAt: true },
        }),
        prisma_1.prisma.salesOrder.findMany({
            where: { assignedDriverId: driverId, status: client_1.SalesOrderStatus.DELIVERED, deliveredAt: { not: null } },
            select: { deliveredAt: true },
            orderBy: { deliveredAt: "desc" },
        }),
    ]);
    const durationsMinutes = [];
    const perWeekdayCounts = new Array(7).fill(0);
    for (const order of rangeOrders) {
        if (order.deliveredAt) {
            const weekdayIndex = order.deliveredAt.getDay();
            perWeekdayCounts[weekdayIndex] = (perWeekdayCounts[weekdayIndex] ?? 0) + 1;
        }
        if (order.pickedUpAt && order.deliveredAt) {
            const minutes = (order.deliveredAt.getTime() - order.pickedUpAt.getTime()) / 60_000;
            if (minutes >= 0) {
                durationsMinutes.push(minutes);
            }
        }
    }
    const avgDeliveryMinutes = durationsMinutes.length > 0
        ? Math.round(durationsMinutes.reduce((sum, value) => sum + value, 0) / durationsMinutes.length)
        : null;
    const fastestDeliveryMinutes = durationsMinutes.length > 0 ? Math.round(Math.min(...durationsMinutes)) : null;
    const perWeekday = WEEKDAY_LABELS.map((label, index) => ({
        weekday: index,
        label,
        deliveries: perWeekdayCounts[index] ?? 0,
    }));
    // Distinct local-day keys (YYYY-MM-DD) with >=1 delivery, across all-time history, newest first —
    // used to walk backward day-by-day for both streak stats below.
    const deliveryDayKeys = new Set(allDeliveredDates
        .map((order) => order.deliveredAt)
        .filter((date) => date !== null)
        .map((date) => date.toISOString().slice(0, 10)));
    const sortedDayKeys = Array.from(deliveryDayKeys).sort((a, b) => b.localeCompare(a));
    function dayKey(date) {
        return date.toISOString().slice(0, 10);
    }
    let currentStreakDays = 0;
    {
        const cursor = new Date(now);
        cursor.setHours(0, 0, 0, 0);
        // A streak "counts" today even with zero deliveries yet today (a driver checking mid-shift
        // shouldn't see their streak drop to 0 before the day is over) — only walks back from
        // yesterday if today itself has no delivery on file.
        if (!deliveryDayKeys.has(dayKey(cursor))) {
            cursor.setDate(cursor.getDate() - 1);
        }
        while (deliveryDayKeys.has(dayKey(cursor))) {
            currentStreakDays += 1;
            cursor.setDate(cursor.getDate() - 1);
        }
    }
    let bestStreakDays = 0;
    {
        let running = 0;
        let previousKey = null;
        for (let i = sortedDayKeys.length - 1; i >= 0; i -= 1) {
            const key = sortedDayKeys[i];
            if (previousKey === null) {
                running = 1;
            }
            else {
                const previousDate = new Date(`${previousKey}T00:00:00`);
                previousDate.setDate(previousDate.getDate() + 1);
                running = dayKey(previousDate) === key ? running + 1 : 1;
            }
            bestStreakDays = Math.max(bestStreakDays, running);
            previousKey = key;
        }
    }
    return {
        range,
        totalDeliveries: rangeOrders.length,
        avgDeliveryMinutes,
        fastestDeliveryMinutes,
        perWeekday,
        currentStreakDays,
        bestStreakDays,
    };
}
