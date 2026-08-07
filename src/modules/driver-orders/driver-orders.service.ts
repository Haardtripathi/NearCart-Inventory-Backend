import { AuditAction, NotificationLogType, SalesOrderStatus } from "@prisma/client";

import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { createAuditLog } from "../audit/audit.service";
import { notifyOrderEvent } from "../../services/order-event-webhook.service";
import { sendPushToOrgStaff } from "../../services/push-notification.service";
import { upsertDeviceToken } from "../../services/device-tokens.service";
import { uploadImageToCloudinary } from "../uploads/uploads.service";
import { recordNotificationLog } from "../notifications/notifications.service";
import {
  assignDriverToSalesOrder,
  findNearestFreeDriver,
  findNearestUnassignedOrderForDriver,
  parseDeclinedDriverIds,
} from "../sales-orders/sales-orders.service";

const DRIVER_VISIBLE_STATUSES: SalesOrderStatus[] = [SalesOrderStatus.READY, SalesOrderStatus.OUT_FOR_DELIVERY];

function serializeDriverOrder(order: Awaited<ReturnType<typeof findAssignedOrder>>) {
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
      // Pickup-point coordinates for the driver app's map screen — see Branch.latitude/longitude
      // doc comment. Nullable for branches that predate that column / never had it backfilled.
      latitude: order.branch.latitude,
      longitude: order.branch.longitude,
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

async function findAssignedOrder(driverId: string, orderId: string) {
  const order = await prisma.salesOrder.findFirst({
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
    throw ApiError.notFound("Order not found or not assigned to you");
  }

  return order;
}

export async function listDriverOrders(driverId: string) {
  const orders = await prisma.salesOrder.findMany({
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
export async function arriveDriverOrder(driverId: string, orderId: string) {
  const order = await findAssignedOrder(driverId, orderId);

  if (order.status !== SalesOrderStatus.READY) {
    throw ApiError.badRequest(
      "Only orders that are READY (assigned but not yet picked up) can be marked arrived",
    );
  }

  if (order.arrivedForPickupAt) {
    throw ApiError.badRequest("Arrival for this order has already been recorded");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Same atomic-updateMany-then-conflict pattern as pickupDriverOrder/deliverDriverOrder above —
    // closes the same "two concurrent calls" race, plus doubles as the re-check against a
    // just-recorded arrival (arrivedForPickupAt: null in the WHERE) so two racing calls can't both
    // "succeed".
    const { count } = await tx.salesOrder.updateMany({
      where: {
        id: orderId,
        assignedDriverId: driverId,
        status: SalesOrderStatus.READY,
        arrivedForPickupAt: null,
      },
      data: {
        arrivedForPickupAt: new Date(),
      },
    });

    if (count === 0) {
      throw ApiError.conflict(
        "Order is no longer eligible for an arrival update — it may have changed state or already been marked arrived",
      );
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

    await createAuditLog(tx, {
      organizationId: order.organizationId,
      action: AuditAction.ORDER_DRIVER_ARRIVED,
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

  void sendPushToOrgStaff(updated.organizationId, {
    title,
    body,
    data: notificationData,
    channelId: "order_alert",
  }).catch((error) => {
    console.warn(
      `[driver-orders] Failed to push driver-arrived alert to org staff for order ${updated.id}`,
      error,
    );
  });

  void recordNotificationLog(prisma, {
    organizationId: updated.organizationId,
    type: NotificationLogType.ORDER_DRIVER_ARRIVED,
    title,
    body,
    data: notificationData,
  }).catch((error) => {
    console.warn(
      `[driver-orders] Failed to record driver-arrived notification log for order ${updated.id}`,
      error,
    );
  });

  return serializeDriverOrder(updated);
}

export async function pickupDriverOrder(driverId: string, orderId: string) {
  const order = await findAssignedOrder(driverId, orderId);

  if (order.status !== SalesOrderStatus.READY) {
    throw ApiError.badRequest("Only orders that are READY can be picked up");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Guard against two concurrent pickup calls for the same order (e.g. a flaky mobile client
    // retrying the request): the WHERE clause's status + assignedDriverId checks are evaluated
    // atomically as part of the single UPDATE statement (true on SQLite/libSQL just as it was on
    // Postgres pre-migration — see sales-orders.service.ts's assignDriverToSalesOrder for the
    // fuller writeup of why a single atomic UPDATE, not a row lock, is what actually closes this
    // race on this engine), so only the first caller can win.
    const { count } = await tx.salesOrder.updateMany({
      where: { id: orderId, assignedDriverId: driverId, status: SalesOrderStatus.READY },
      data: {
        status: SalesOrderStatus.OUT_FOR_DELIVERY,
        pickedUpAt: new Date(),
      },
    });

    if (count === 0) {
      throw ApiError.conflict("Order is no longer READY — it may have already been picked up");
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

    await createAuditLog(tx, {
      organizationId: order.organizationId,
      action: AuditAction.ORDER_PICKUP,
      entityType: "SalesOrder",
      entityId: order.id,
      before: { status: order.status },
      after: { status: result.status, pickedUpAt: result.pickedUpAt },
      meta: { driverId },
    });

    return result;
  });

  if (updated.externalOrderId) {
    void notifyOrderEvent({
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
export async function deliverDriverOrder(
  driverId: string,
  orderId: string,
  photo?: { buffer: Buffer; originalname: string },
) {
  const order = await findAssignedOrder(driverId, orderId);

  if (order.status !== SalesOrderStatus.OUT_FOR_DELIVERY) {
    throw ApiError.badRequest("Only orders that are OUT_FOR_DELIVERY can be marked delivered");
  }

  let deliveryProofPhotoUrl: string | undefined;
  if (photo) {
    const upload = await uploadImageToCloudinary({
      fileBuffer: photo.buffer,
      originalFilename: photo.originalname,
      scope: "general",
      ownerId: `driver-${driverId}`,
    });
    deliveryProofPhotoUrl = upload.url;
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Guard against two concurrent deliver calls for the same order — see pickupDriverOrder
    // above for the same pattern/rationale.
    const { count } = await tx.salesOrder.updateMany({
      where: { id: orderId, assignedDriverId: driverId, status: SalesOrderStatus.OUT_FOR_DELIVERY },
      data: {
        status: SalesOrderStatus.DELIVERED,
        deliveredAt: new Date(),
        ...(deliveryProofPhotoUrl
          ? { deliveryProofPhotoUrl, deliveryProofPhotoAt: new Date() }
          : {}),
      },
    });

    if (count === 0) {
      throw ApiError.conflict("Order is no longer OUT_FOR_DELIVERY — it may have already been delivered");
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

    await createAuditLog(tx, {
      organizationId: order.organizationId,
      action: AuditAction.ORDER_DELIVER,
      entityType: "SalesOrder",
      entityId: order.id,
      before: { status: order.status },
      after: { status: result.status, deliveredAt: result.deliveredAt },
      meta: { driverId },
    });

    return result;
  });

  if (updated.externalOrderId) {
    void notifyOrderEvent({
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
export async function declineDriverOrder(driverId: string, orderId: string) {
  const order = await findAssignedOrder(driverId, orderId);

  if (order.status !== SalesOrderStatus.READY) {
    throw ApiError.badRequest("Only orders that are READY (not yet picked up) can be declined");
  }

  const declinedByDriverIds = Array.from(
    new Set([...parseDeclinedDriverIds(order.declinedByDriverIds), driverId]),
  );

  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.salesOrder.updateMany({
      where: { id: orderId, assignedDriverId: driverId, status: SalesOrderStatus.READY },
      data: {
        assignedDriverId: null,
        assignedById: null,
        assignedAt: null,
        declinedByDriverIds,
      },
    });

    if (count === 0) {
      throw ApiError.conflict("Order is no longer assigned to you — it may have already changed state");
    }

    const result = await tx.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, branch: true, customer: true, organization: true },
    });

    await createAuditLog(tx, {
      organizationId: order.organizationId,
      action: AuditAction.ORDER_DRIVER_DECLINE,
      entityType: "SalesOrder",
      entityId: order.id,
      before: { status: order.status, assignedDriverId: driverId },
      after: { status: result.status, assignedDriverId: null },
      meta: { driverId, declinedByDriverIds },
    });

    return result;
  });

  try {
    const nearestDriver = await findNearestFreeDriver(
      updated.branchId,
      parseDeclinedDriverIds(updated.declinedByDriverIds),
    );

    if (nearestDriver) {
      await assignDriverToSalesOrder(updated.organizationId, updated.id, null, nearestDriver.id);
      // assignDriverToSalesOrder's own return shape doesn't include `organization`, which
      // serializeDriverOrder requires — re-fetch with the same include set the rest of this
      // file uses (see pickupDriverOrder/deliverDriverOrder) rather than widening that
      // function's include just for this one caller.
      const reassigned = await prisma.salesOrder.findUniqueOrThrow({
        where: { id: updated.id },
        include: { items: true, branch: true, customer: true, organization: true },
      });
      return serializeDriverOrder(reassigned);
    }
  } catch (error) {
    console.warn(`[driver-orders] Re-assignment after decline failed for order ${updated.id}`, error);
  }

  // No replacement driver found (or re-assignment attempt failed) — the order is back to
  // unassigned READY. Without this, NearCart never learns the assignment was reversed and keeps
  // showing the declining driver's stale name/phone on the order until some later event
  // overwrites it (see the matching DRIVER_UNASSIGNED branch added to NearCart's
  // applyInventoryOrderEvent). Fire-and-forget, same resilience posture as every other call here.
  if (updated.externalOrderId) {
    void notifyOrderEvent({
      externalOrderId: updated.externalOrderId,
      status: updated.status,
      eventType: "DRIVER_UNASSIGNED",
    });
  }

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
export async function updateDriverAvailability(driverId: string, isAvailableForAssignment: boolean) {
  const updated = await prisma.driver.update({
    where: { id: driverId },
    data: { isAvailableForAssignment },
    select: {
      id: true,
      isAvailableForAssignment: true,
      lastKnownLatitude: true,
      lastKnownLongitude: true,
    },
  });

  if (isAvailableForAssignment && updated.lastKnownLatitude != null && updated.lastKnownLongitude != null) {
    try {
      const nearestOrder = await findNearestUnassignedOrderForDriver(driverId, {
        latitude: updated.lastKnownLatitude,
        longitude: updated.lastKnownLongitude,
      });

      if (nearestOrder) {
        const order = await prisma.salesOrder.findUnique({
          where: { id: nearestOrder.id },
          select: { organizationId: true },
        });

        if (order) {
          await assignDriverToSalesOrder(order.organizationId, nearestOrder.id, null, driverId);
        }
      }
    } catch (error) {
      console.warn(
        `[driver-orders] Auto-match on driver ${driverId} coming back online failed`,
        error,
      );
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
export async function updateDriverLocation(driverId: string, latitude: number, longitude: number) {
  return prisma.driver.update({
    where: { id: driverId },
    data: {
      lastKnownLatitude: latitude,
      lastKnownLongitude: longitude,
      lastLocationAt: new Date(),
    },
    select: { id: true, lastKnownLatitude: true, lastKnownLongitude: true, lastLocationAt: true },
  });
}

export async function registerDriverDeviceTokenForDriver(
  driverId: string,
  input: { expoPushToken: string; platform?: string },
) {
  return upsertDeviceToken("DRIVER", driverId, input);
}

const DRIVER_HISTORY_PAGE_SIZE = 20;

/**
 * GET /driver/orders/history — DELIVERED orders assigned to the calling driver, newest first.
 * A separate call from GET /driver/orders (which only ever returns READY/OUT_FOR_DELIVERY, see
 * DRIVER_VISIBLE_STATUSES above) rather than widening that one, since the "active deliveries"
 * list and a "past deliveries" history feed have different UX needs (pagination here, none there).
 */
export async function listDriverOrderHistory(driverId: string, page: number) {
  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * DRIVER_HISTORY_PAGE_SIZE;

  const [orders, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { assignedDriverId: driverId, status: SalesOrderStatus.DELIVERED },
      include: { items: true, branch: true, customer: true, organization: true },
      orderBy: { deliveredAt: "desc" },
      skip,
      take: DRIVER_HISTORY_PAGE_SIZE,
    }),
    prisma.salesOrder.count({
      where: { assignedDriverId: driverId, status: SalesOrderStatus.DELIVERED },
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

export type DriverEarningsRange = "today" | "week" | "month" | "all";

/** Midnight in the server's local timezone — good enough for a "today so far" cutoff without
 *  pulling in a timezone library for a single driver-facing dashboard. */
function startOfLocalDay(reference: Date): Date {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  return start;
}

function rangeStartDate(range: DriverEarningsRange, now: Date): Date | null {
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
 * GET /driver/earnings/summary?range=today|week|month|all — computed entirely from data already
 * on hand (DELIVERED SalesOrder rows assigned to this driver) rather than a new ledger/earnings
 * table: there's no per-order delivery-fee column anywhere in the schema, so each delivery is
 * costed at the flat `DRIVER_DELIVERY_FEE` env rate (see config/env.ts's doc comment on that var)
 * — a deliberately simple placeholder rather than a speculative new financial model bolted on
 * while another agent may be touching schema.prisma concurrently. `perDay` is a small array (at
 * most 30 entries for `month`) suitable for a sparkline/bar chart on the driver app's earnings
 * screen.
 */
export async function getDriverEarningsSummary(driverId: string, range: DriverEarningsRange) {
  const now = new Date();
  const startDate = rangeStartDate(range, now);

  const deliveredOrders = await prisma.salesOrder.findMany({
    where: {
      assignedDriverId: driverId,
      status: SalesOrderStatus.DELIVERED,
      ...(startDate ? { deliveredAt: { gte: startDate } } : {}),
    },
    select: { id: true, orderNumber: true, deliveredAt: true, branch: { select: { name: true } } },
    orderBy: { deliveredAt: "desc" },
  });

  const feePerDelivery = env.DRIVER_DELIVERY_FEE;

  const perDayMap = new Map<string, { date: string; deliveries: number; earnings: number }>();
  for (const order of deliveredOrders) {
    if (!order.deliveredAt) continue;
    const dateKey = order.deliveredAt.toISOString().slice(0, 10);
    const existing = perDayMap.get(dateKey) ?? { date: dateKey, deliveries: 0, earnings: 0 };
    existing.deliveries += 1;
    existing.earnings += feePerDelivery;
    perDayMap.set(dateKey, existing);
  }

  const perDay = Array.from(perDayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const [lifetimeDeliveries] = await Promise.all([
    prisma.salesOrder.count({
      where: { assignedDriverId: driverId, status: SalesOrderStatus.DELIVERED },
    }),
  ]);

  return {
    range,
    feePerDelivery,
    totalDeliveries: deliveredOrders.length,
    totalEarnings: deliveredOrders.length * feePerDelivery,
    perDay,
    recentDeliveries: deliveredOrders.slice(0, 10).map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      branchName: order.branch.name,
      deliveredAt: order.deliveredAt,
      earning: feePerDelivery,
    })),
    lifetime: {
      totalDeliveries: lifetimeDeliveries,
      totalEarnings: lifetimeDeliveries * feePerDelivery,
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
export async function getDriverPerformanceSummary(driverId: string, range: DriverEarningsRange) {
  const now = new Date();
  const startDate = rangeStartDate(range, now);

  const [rangeOrders, allDeliveredDates] = await Promise.all([
    prisma.salesOrder.findMany({
      where: {
        assignedDriverId: driverId,
        status: SalesOrderStatus.DELIVERED,
        ...(startDate ? { deliveredAt: { gte: startDate } } : {}),
      },
      select: { pickedUpAt: true, deliveredAt: true },
    }),
    prisma.salesOrder.findMany({
      where: { assignedDriverId: driverId, status: SalesOrderStatus.DELIVERED, deliveredAt: { not: null } },
      select: { deliveredAt: true },
      orderBy: { deliveredAt: "desc" },
    }),
  ]);

  const durationsMinutes: number[] = [];
  const perWeekdayCounts = new Array(7).fill(0) as number[];

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

  const avgDeliveryMinutes =
    durationsMinutes.length > 0
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
  const deliveryDayKeys = new Set(
    allDeliveredDates
      .map((order) => order.deliveredAt)
      .filter((date): date is Date => date !== null)
      .map((date) => date.toISOString().slice(0, 10)),
  );
  const sortedDayKeys = Array.from(deliveryDayKeys).sort((a, b) => b.localeCompare(a));

  function dayKey(date: Date): string {
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
    let previousKey: string | null = null;
    for (let i = sortedDayKeys.length - 1; i >= 0; i -= 1) {
      const key = sortedDayKeys[i]!;
      if (previousKey === null) {
        running = 1;
      } else {
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
