import {
  AuditAction,
  DriverStatus,
  OrderSource,
  PaymentStatus,
  ReferenceType,
  SalesOrderStatus,
  StockMovementType,
} from "@prisma/client";

import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { toDecimal } from "../../utils/decimal";
import { ApiError } from "../../utils/ApiError";
import { syncEntityFieldTranslations } from "../../utils/entityFieldTranslations";
import { assertBranchInOrg, assertCustomerInOrg, assertVariantInOrg } from "../../utils/guards";
import { toNullableJsonValue } from "../../utils/json";
import { generateDocumentNumber } from "../../utils/numbering";
import { buildPagination, getPagination } from "../../utils/pagination";
import { createAuditLog } from "../audit/audit.service";
import { applyStockMovement } from "../inventory/inventory.service";
import { notifyOrderEvent } from "../../services/order-event-webhook.service";
import { sendPushToDriver } from "../../services/push-notification.service";

interface SalesOrderItemInput {
  productId: string;
  variantId: string;
  quantity: string | number;
  unitPrice?: string | number;
  taxRate?: string | number;
  discountAmount?: string | number;
  metadata?: unknown;
}

const INTERACTIVE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

async function prepareSalesOrderItems(organizationId: string, items: SalesOrderItemInput[]) {
  let subtotal = toDecimal(0);
  let taxTotal = toDecimal(0);
  let discountTotal = toDecimal(0);
  let total = toDecimal(0);

  const preparedItems = [];

  for (const item of items) {
    const variant = await assertVariantInOrg(prisma, organizationId, item.variantId);

    if (variant.productId !== item.productId) {
      throw ApiError.badRequest("Sales order item productId does not match the selected variant");
    }

    const quantity = toDecimal(item.quantity);
    const unitPrice = toDecimal(item.unitPrice ?? variant.sellingPrice);
    const taxRate = toDecimal(item.taxRate ?? 0);
    const discountAmount = toDecimal(item.discountAmount ?? 0);

    if (quantity.lessThanOrEqualTo(0)) {
      throw ApiError.badRequest("Sales quantities must be positive");
    }

    if (unitPrice.isNegative()) {
      throw ApiError.badRequest("Unit price cannot be negative");
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
      metadata: toNullableJsonValue(item.metadata),
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

const EDITABLE_ORDER_STATUSES: SalesOrderStatus[] = [SalesOrderStatus.DRAFT, SalesOrderStatus.PENDING];
const DELIVERED_OR_RETURNED_STATUSES: SalesOrderStatus[] = [
  SalesOrderStatus.DELIVERED,
  SalesOrderStatus.RETURNED,
];
const CLOSED_ORDER_STATUSES: SalesOrderStatus[] = [SalesOrderStatus.CANCELLED, SalesOrderStatus.REJECTED];
const CANCELLABLE_STOCK_REVERSAL_STATUSES: SalesOrderStatus[] = [
  SalesOrderStatus.CONFIRMED,
  SalesOrderStatus.READY,
  SalesOrderStatus.OUT_FOR_DELIVERY,
];
const DELIVERABLE_ORDER_STATUSES: SalesOrderStatus[] = [
  SalesOrderStatus.CONFIRMED,
  SalesOrderStatus.READY,
  SalesOrderStatus.OUT_FOR_DELIVERY,
];

function ensureEditableStatus(status: SalesOrderStatus) {
  if (!EDITABLE_ORDER_STATUSES.includes(status)) {
    throw ApiError.badRequest("Only draft or pending sales orders can be edited");
  }
}

export async function listSalesOrders(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
    branchId?: string;
    customerId?: string;
    status?: SalesOrderStatus;
    paymentStatus?: PaymentStatus;
    source?: OrderSource;
  },
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
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
            { orderNumber: { contains: query.search, mode: "insensitive" as const } },
            { customer: { name: { contains: query.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.salesOrder.findMany({
      where,
      include: {
        branch: true,
        customer: true,
        assignedDriver: {
          select: { id: true, fullName: true, phone: true, vehicleType: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.salesOrder.count({ where }),
  ]);

  return {
    items,
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createSalesOrder(
  organizationId: string,
  actorUserId: string,
  input: {
    branchId: string;
    customerId?: string;
    orderNumber?: string;
    source?: OrderSource;
    status?: SalesOrderStatus;
    paymentStatus?: PaymentStatus;
    notes?: string;
    items: SalesOrderItemInput[];
  },
) {
  await assertBranchInOrg(prisma, organizationId, input.branchId);

  if (input.customerId) {
    await assertCustomerInOrg(prisma, organizationId, input.customerId);
  }

  const prepared = await prepareSalesOrderItems(organizationId, input.items);

  const order = await prisma.salesOrder.create({
    data: {
      organizationId,
      branchId: input.branchId,
      customerId: input.customerId ?? null,
      orderNumber: input.orderNumber ?? generateDocumentNumber("SO"),
      source: input.source ?? OrderSource.APP,
      status: input.status ?? SalesOrderStatus.PENDING,
      paymentStatus: input.paymentStatus ?? PaymentStatus.UNPAID,
      notes: input.notes ?? null,
      // Only PENDING orders are ever auto-cancelled by the confirmation sweep (see
      // jobs/order-confirmation-sweep.ts) — a DRAFT/CONFIRMED/etc. created directly via this
      // staff-facing endpoint with an explicit status still gets a deadline set for consistency,
      // but the sweep's own WHERE clause only ever matches status = PENDING rows.
      confirmationDeadlineAt: new Date(Date.now() + env.ORDER_CONFIRMATION_TIMEOUT_MINUTES * 60_000),
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

  await syncEntityFieldTranslations(prisma, {
    organizationId,
    entityType: "SalesOrder",
    entityId: order.id,
    fields: [{ fieldKey: "notes", value: input.notes }],
  });

  for (const item of order.items) {
    await syncEntityFieldTranslations(prisma, {
      organizationId,
      entityType: "SalesOrderItem",
      entityId: item.id,
      fields: [
        { fieldKey: "productNameSnapshot", value: item.productNameSnapshot },
        { fieldKey: "variantNameSnapshot", value: item.variantNameSnapshot },
      ],
    });
  }

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "SalesOrder",
    entityId: order.id,
    after: order,
  });

  return order;
}

export async function getSalesOrderById(organizationId: string, orderId: string) {
  const order = await prisma.salesOrder.findFirst({
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
      assignedDriver: {
        select: { id: true, fullName: true, phone: true, vehicleType: true },
      },
    },
  });

  if (!order) {
    throw ApiError.notFound("Sales order not found");
  }

  return order;
}

export async function updateSalesOrder(
  organizationId: string,
  orderId: string,
  actorUserId: string,
  input: {
    branchId?: string;
    customerId?: string;
    source?: OrderSource;
    status?: SalesOrderStatus;
    paymentStatus?: PaymentStatus;
    notes?: string;
    items?: SalesOrderItemInput[];
  },
) {
  const existing = await getSalesOrderById(organizationId, orderId);
  ensureEditableStatus(existing.status);

  if (input.branchId) {
    await assertBranchInOrg(prisma, organizationId, input.branchId);
  }

  if (input.customerId) {
    await assertCustomerInOrg(prisma, organizationId, input.customerId);
  }

  if (input.status && !EDITABLE_ORDER_STATUSES.includes(input.status)) {
    throw ApiError.badRequest("Only DRAFT or PENDING are allowed in update flow");
  }

  const prepared = input.items ? await prepareSalesOrderItems(organizationId, input.items) : null;

  await prisma.$transaction(async (tx) => {
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

    await syncEntityFieldTranslations(tx, {
      organizationId,
      entityType: "SalesOrder",
      entityId: orderId,
      fields: [{ fieldKey: "notes", value: input.notes ?? existing.notes }],
    });
  }, INTERACTIVE_TRANSACTION_OPTIONS);

  const updated = await getSalesOrderById(organizationId, orderId);

  for (const item of updated.items) {
    await syncEntityFieldTranslations(prisma, {
      organizationId,
      entityType: "SalesOrderItem",
      entityId: item.id,
      fields: [
        { fieldKey: "productNameSnapshot", value: item.productNameSnapshot },
        { fieldKey: "variantNameSnapshot", value: item.variantNameSnapshot },
      ],
    });
  }

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "SalesOrder",
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function confirmSalesOrder(organizationId: string, orderId: string, actorUserId: string) {
  const order = await getSalesOrderById(organizationId, orderId);

  if (order.status === SalesOrderStatus.CONFIRMED) {
    throw ApiError.badRequest("Sales order is already confirmed");
  }

  if (!EDITABLE_ORDER_STATUSES.includes(order.status)) {
    throw ApiError.badRequest("Only draft or pending orders can be confirmed");
  }

  const confirmed = await prisma.$transaction(async (tx) => {
    // Guard against a concurrent confirm racing this same transition (e.g. a double-click or a
    // duplicated webhook retry): claim the row atomically before touching stock — Postgres locks
    // the row on this UPDATE, so a second concurrent transaction's updateMany blocks until this
    // one commits, then re-evaluates the status predicate against 0 matching rows and safely
    // no-ops instead of also decrementing stock for the same order.
    const { count } = await tx.salesOrder.updateMany({
      where: { id: orderId, organizationId, status: { in: EDITABLE_ORDER_STATUSES } },
      data: {
        status: SalesOrderStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedById: actorUserId,
      },
    });

    if (count === 0) {
      throw ApiError.conflict("Order is no longer draft/pending — it may have already been confirmed");
    }

    for (const item of order.items) {
      await applyStockMovement(tx, {
        organizationId,
        branchId: order.branchId,
        variantId: item.variantId,
        movementType: StockMovementType.SALE,
        referenceType: ReferenceType.SALES_ORDER,
        referenceId: order.id,
        quantityDelta: toDecimal(item.quantity).negated(),
        unitCost: item.variant.costPrice,
        note: order.notes ?? undefined,
        createdById: actorUserId,
      });
    }

    const updated = await tx.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: true,
        branch: true,
        customer: true,
      },
    });

    await createAuditLog(tx, {
      organizationId,
      actorUserId,
      action: AuditAction.ORDER_CONFIRM,
      entityType: "SalesOrder",
      entityId: order.id,
      before: order,
      after: updated,
    });

    return updated;
  }, INTERACTIVE_TRANSACTION_OPTIONS);

  if (confirmed.externalOrderId) {
    void notifyOrderEvent({
      externalOrderId: confirmed.externalOrderId,
      status: confirmed.status,
      eventType: "CONFIRMED",
    });
  }

  return confirmed;
}

/**
 * `actorUserId` is nullable for the same reason as `cancelSalesOrder` above: the
 * order-confirmation-sweep cron (jobs/order-confirmation-sweep.ts) auto-rejects PENDING orders
 * past their `confirmationDeadlineAt` with no authenticated staff user behind the action. Passing
 * `null` round-trips cleanly through `createAuditLog`'s already-nullable `actorUserId` — real
 * staff-initiated rejects (the controller) continue to pass a real string.
 */
export async function rejectSalesOrder(
  organizationId: string,
  orderId: string,
  actorUserId: string | null,
  rejectionReason: string,
) {
  const order = await getSalesOrderById(organizationId, orderId);

  if (DELIVERED_OR_RETURNED_STATUSES.includes(order.status)) {
    throw ApiError.badRequest("Delivered or returned orders cannot be rejected");
  }

  if (!EDITABLE_ORDER_STATUSES.includes(order.status)) {
    throw ApiError.badRequest("Only draft or pending orders can be rejected");
  }

  const updated = await prisma.salesOrder.update({
    where: { id: orderId },
    data: {
      status: SalesOrderStatus.REJECTED,
      rejectionReason,
    },
  });

  await syncEntityFieldTranslations(prisma, {
    organizationId,
    entityType: "SalesOrder",
    entityId: updated.id,
    fields: [{ fieldKey: "rejectionReason", value: rejectionReason }],
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.ORDER_REJECT,
    entityType: "SalesOrder",
    entityId: updated.id,
    before: order,
    after: updated,
  });

  if (updated.externalOrderId) {
    void notifyOrderEvent({
      externalOrderId: updated.externalOrderId,
      status: updated.status,
      eventType: "REJECTED",
    });
  }

  return updated;
}

/**
 * `actorUserId` is nullable: this is the one sales-order transition that can also be triggered
 * by the marketplace bridge (see marketplace.service.ts cancelBridgedSalesOrder) rather than an
 * authenticated staff user, and there is no sentinel "system" User row in this schema to fall
 * back to — fabricating one would require a schema change of its own and would misrepresent the
 * action as having been taken by a real account. Passing `null` here is the deliberate choice:
 * `AuditLog.actorUserId` and `InventoryLedger.createdById` are both already nullable FKs, so a
 * null actor round-trips cleanly, and the audit action (ORDER_CANCEL vs ORDER_CANCEL_BRIDGE,
 * chosen below) plus the `meta` note is what actually distinguishes "cancelled via the customer
 * app" for reporting — not a fake user id.
 */
export async function cancelSalesOrder(organizationId: string, orderId: string, actorUserId: string | null) {
  const order = await getSalesOrderById(organizationId, orderId);

  if (CLOSED_ORDER_STATUSES.includes(order.status)) {
    throw ApiError.badRequest("Order is already closed");
  }

  if (DELIVERED_OR_RETURNED_STATUSES.includes(order.status)) {
    throw ApiError.badRequest("Delivered or returned orders cannot be cancelled in this flow");
  }

  const cancelled = await prisma.$transaction(async (tx) => {
    if (CANCELLABLE_STOCK_REVERSAL_STATUSES.includes(order.status)) {
      for (const item of order.items) {
        await applyStockMovement(tx, {
          organizationId,
          branchId: order.branchId,
          variantId: item.variantId,
          movementType: StockMovementType.SALE_CANCEL,
          referenceType: ReferenceType.SALES_ORDER,
          referenceId: order.id,
          quantityDelta: item.quantity,
          unitCost: item.variant.costPrice,
          note: "Sales order cancelled",
          createdById: actorUserId ?? undefined,
        });
      }
    }

    const updated = await tx.salesOrder.update({
      where: { id: orderId },
      data: {
        status: SalesOrderStatus.CANCELLED,
      },
    });

    await createAuditLog(tx, {
      organizationId,
      actorUserId,
      // Was plain AuditAction.UPDATE regardless of caller before this change — every other
      // transition (CONFIRM/REJECT/DELIVER/READY) already had a dedicated action, cancel was the
      // one exception. Fixed alongside adding the bridge distinction since both changes touch
      // this exact line.
      action: actorUserId ? AuditAction.ORDER_CANCEL : AuditAction.ORDER_CANCEL_BRIDGE,
      entityType: "SalesOrder",
      entityId: order.id,
      before: order,
      after: updated,
      meta: actorUserId ? undefined : { source: "marketplace_bridge", note: "Cancelled via NearCart customer app" },
    });

    return updated;
  }, INTERACTIVE_TRANSACTION_OPTIONS);

  return cancelled;
}

export async function deliverSalesOrder(organizationId: string, orderId: string, actorUserId: string) {
  const order = await getSalesOrderById(organizationId, orderId);

  if (order.status === SalesOrderStatus.DELIVERED) {
    throw ApiError.badRequest("Sales order is already delivered");
  }

  if (!DELIVERABLE_ORDER_STATUSES.includes(order.status)) {
    throw ApiError.badRequest("Only confirmed orders can be delivered");
  }

  const updated = await prisma.salesOrder.update({
    where: { id: orderId },
    data: {
      status: SalesOrderStatus.DELIVERED,
      deliveredAt: new Date(),
      deliveredById: actorUserId,
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.ORDER_DELIVER,
    entityType: "SalesOrder",
    entityId: updated.id,
    before: order,
    after: updated,
  });

  if (updated.externalOrderId) {
    void notifyOrderEvent({
      externalOrderId: updated.externalOrderId,
      status: updated.status,
      eventType: "DELIVERED",
    });
  }

  return updated;
}

const ACTIVE_DRIVER_ORDER_STATUSES: SalesOrderStatus[] = [
  SalesOrderStatus.READY,
  SalesOrderStatus.OUT_FOR_DELIVERY,
];

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/** Standard haversine great-circle distance between two lat/long points, in kilometers. */
function haversineDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Ranks currently-free, VERIFIED drivers by distance from a branch's pickup-point coordinates and
 * returns the closest one within `DRIVER_MATCH_RADIUS_KM`, or `null` if the branch has no
 * coordinates set, no driver is free, or no free driver is within radius. "Free" = a driver has
 * `isAvailableForAssignment: true` and no `SalesOrder` currently assigned to them with status
 * READY/OUT_FOR_DELIVERY (see the `Driver.assignedOrders` relation). Called automatically from
 * `markSalesOrderReady` below — the existing manual assign-driver dropdown in the Inventory
 * frontend remains available as a fallback when this returns null.
 */
export async function findNearestFreeDriver(branchId: string): Promise<{ id: string } | null> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { latitude: true, longitude: true },
  });

  if (!branch || branch.latitude == null || branch.longitude == null) {
    return null;
  }

  const branchOrigin = { latitude: branch.latitude, longitude: branch.longitude };

  const candidates = await prisma.driver.findMany({
    where: {
      isAvailableForAssignment: true,
      status: DriverStatus.VERIFIED,
      lastKnownLatitude: { not: null },
      lastKnownLongitude: { not: null },
      assignedOrders: {
        none: {
          status: { in: ACTIVE_DRIVER_ORDER_STATUSES },
        },
      },
    },
    select: { id: true, lastKnownLatitude: true, lastKnownLongitude: true },
  });

  let nearest: { id: string; distanceKm: number } | null = null;

  for (const candidate of candidates) {
    if (candidate.lastKnownLatitude == null || candidate.lastKnownLongitude == null) {
      continue;
    }

    const distanceKm = haversineDistanceKm(branchOrigin, {
      latitude: candidate.lastKnownLatitude,
      longitude: candidate.lastKnownLongitude,
    });

    if (distanceKm > env.DRIVER_MATCH_RADIUS_KM) {
      continue;
    }

    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { id: candidate.id, distanceKm };
    }
  }

  return nearest ? { id: nearest.id } : null;
}

/**
 * Transitions CONFIRMED -> READY, the first of the two previously-dead SalesOrderStatus
 * transitions to get wired up. Separate step from assign-driver (below) since the shop may mark
 * an order ready for pickup before a driver has been assigned — matching the locked
 * PHASE1_REQUIREMENTS.md contract (`PATCH /:id/mark-ready` is distinct from
 * `POST /:id/assign-driver`).
 */
export async function markSalesOrderReady(organizationId: string, orderId: string, actorUserId: string) {
  const order = await getSalesOrderById(organizationId, orderId);

  if (order.status !== SalesOrderStatus.CONFIRMED) {
    throw ApiError.badRequest("Only confirmed orders can be marked ready");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Guard against a concurrent request racing this same transition: the WHERE clause's
    // status check is evaluated atomically by Postgres as part of the UPDATE, so only one
    // concurrent caller can ever flip CONFIRMED -> READY for this row.
    const { count } = await tx.salesOrder.updateMany({
      where: { id: orderId, organizationId, status: SalesOrderStatus.CONFIRMED },
      data: {
        status: SalesOrderStatus.READY,
        readyAt: new Date(),
        readyById: actorUserId,
      },
    });

    if (count === 0) {
      throw ApiError.conflict("Order is no longer confirmed — it may have already been marked ready");
    }

    const result = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId } });

    await createAuditLog(tx, {
      organizationId,
      actorUserId,
      action: AuditAction.ORDER_READY,
      entityType: "SalesOrder",
      entityId: result.id,
      before: order,
      after: result,
    });

    return result;
  }, INTERACTIVE_TRANSACTION_OPTIONS);

  if (updated.externalOrderId) {
    void notifyOrderEvent({
      externalOrderId: updated.externalOrderId,
      status: updated.status,
      eventType: "READY",
    });
  }

  // Nearest-free-driver auto-assignment: fires right after the READY transition commits, on a
  // best-effort basis. A failure here must never turn a successful mark-ready into an error
  // response — the order simply stays READY and unassigned, same as if no driver had ever been
  // free, and the existing manual assign-driver dropdown in the Inventory frontend remains the
  // fallback path.
  //
  // Bug fixed 2026-07-27 (found via live end-to-end test): this used to unconditionally
  // `return updated`, the pre-auto-assign snapshot — so a caller that got a driver auto-assigned
  // would see `assignedDriverId: null` in THIS response, only seeing the real assignment on a
  // subsequent GET. The driver was correctly assigned in the DB the whole time; only the
  // response body was stale. Now returns the post-assignment row when assignment succeeds.
  try {
    const nearestDriver = await findNearestFreeDriver(updated.branchId);

    if (nearestDriver) {
      return await assignDriverToSalesOrder(organizationId, updated.id, null, nearestDriver.id);
    }
  } catch (error) {
    console.warn(
      `[sales-orders] Nearest-free-driver auto-assignment failed for order ${updated.id}`,
      error,
    );
  }

  return updated;
}

/**
 * Assigns a driver to a READY order. Drivers are a platform-wide pool (a standalone `Driver`
 * model, not an OrganizationMembership) — see PHASE1_REQUIREMENTS.md's locked 2026-07-24 decision
 * — so any org's staff may assign any VERIFIED driver, without an organization-membership check
 * on the driver itself. See modules/driver-orders for the driver-side pickup/deliver transitions.
 */
/**
 * `actorUserId` is nullable: the nearest-free-driver auto-assign path (called from
 * `markSalesOrderReady` below, right after a READY transition) has no authenticated staff user
 * behind it — the system picked the driver, not a person. `assignedById` is a nullable FK
 * (`SalesOrder.assignedById String?`) and `createAuditLog`'s `actorUserId` is already nullable, so
 * this mirrors the same pattern already used for `cancelSalesOrder`/`rejectSalesOrder`. The
 * manual assign-driver controller continues to pass a real string.
 */
export async function assignDriverToSalesOrder(
  organizationId: string,
  orderId: string,
  actorUserId: string | null,
  driverId: string,
) {
  const order = await getSalesOrderById(organizationId, orderId);

  if (order.status !== SalesOrderStatus.READY) {
    throw ApiError.badRequest("Only orders that are READY can be assigned to a driver");
  }

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { id: true, status: true },
  });

  if (!driver) {
    throw ApiError.notFound("Driver not found");
  }

  if (driver.status !== DriverStatus.VERIFIED) {
    throw ApiError.badRequest("Only verified drivers can be assigned to orders");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Bug fixed 2026-07-27 (found via audit, not yet hit in the single-order manual E2E test):
    // nothing here previously re-checked that `driverId` was still free at assignment time. The
    // order-side status check below (READY -> assigned) is atomic, but that only protects against
    // double-assigning the same ORDER — it does nothing to stop the same DRIVER being assigned to
    // two different orders. That's a real race: findNearestFreeDriver (markSalesOrderReady's
    // auto-assign path) runs as a separate query before this transaction even opens, so two
    // orders going READY around the same time (or a manual dropdown assignment racing an
    // auto-assign) can both see the same driver as "free" and both call this function for it. Lock
    // the driver row for the duration of this transaction so concurrent callers targeting the same
    // driver serialize here, then re-verify under that lock that the driver has no other active
    // (READY/OUT_FOR_DELIVERY) assignment before proceeding — otherwise the second caller commits
    // an assignment for a driver who's already out on a different delivery.
    await tx.$queryRaw`SELECT id FROM "Driver" WHERE id = ${driverId} FOR UPDATE`;

    const activeAssignmentCount = await tx.salesOrder.count({
      where: {
        assignedDriverId: driverId,
        status: { in: ACTIVE_DRIVER_ORDER_STATUSES },
        id: { not: orderId },
      },
    });

    if (activeAssignmentCount > 0) {
      throw ApiError.conflict("Driver already has another active delivery assigned");
    }

    // Guard against a concurrent request racing this same transition (e.g. two staff members
    // assigning different drivers at once): the WHERE clause's status check is evaluated
    // atomically by Postgres as part of the UPDATE, so only one concurrent caller can ever win
    // the READY -> assigned transition for this row.
    const { count } = await tx.salesOrder.updateMany({
      where: { id: orderId, organizationId, status: SalesOrderStatus.READY },
      data: {
        assignedDriverId: driverId,
        assignedById: actorUserId,
        assignedAt: new Date(),
      },
    });

    if (count === 0) {
      throw ApiError.conflict("Order is no longer READY — it may have already been assigned or its state changed");
    }

    const result = await tx.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: true,
        branch: true,
        customer: true,
        assignedDriver: {
          select: { id: true, fullName: true, phone: true, vehicleType: true },
        },
      },
    });

    await createAuditLog(tx, {
      organizationId,
      actorUserId,
      action: AuditAction.ORDER_ASSIGN_DRIVER,
      entityType: "SalesOrder",
      entityId: order.id,
      before: { assignedDriverId: order.assignedDriverId },
      after: { assignedDriverId: result.assignedDriverId },
      meta: { driverId },
    });

    return result;
  }, INTERACTIVE_TRANSACTION_OPTIONS);

  if (updated.externalOrderId) {
    void notifyOrderEvent({
      externalOrderId: updated.externalOrderId,
      status: updated.status,
      eventType: "DRIVER_ASSIGNED",
      assignedDriver: updated.assignedDriver
        ? {
            fullName: updated.assignedDriver.fullName,
            phone: updated.assignedDriver.phone,
            vehicleType: updated.assignedDriver.vehicleType,
          }
        : null,
    });
  }

  void sendPushToDriver(driverId, {
    title: "New delivery assigned",
    body: `You've been assigned order #${updated.orderNumber}.`,
    data: { salesOrderId: updated.id },
    channelId: "order_alert",
  });

  return updated;
}
