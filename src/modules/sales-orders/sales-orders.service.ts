import {
  AuditAction,
  DriverDispatchMode,
  DriverStatus,
  NotificationLogType,
  OrderSource,
  PaymentStatus,
  Prisma,
  ReferenceType,
  SalesOrderStatus,
  StockMovementType,
} from "@prisma/client";

import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import type { DbClient } from "../../types/prisma";
import { toDecimal } from "../../utils/decimal";
import { ApiError } from "../../utils/ApiError";
import { syncEntityFieldTranslations } from "../../utils/entityFieldTranslations";
import { assertBranchInOrg, assertCustomerInOrg, assertVariantInOrg } from "../../utils/guards";
import { toNullableJsonValue } from "../../utils/json";
import { generateDocumentNumber } from "../../utils/numbering";
import { buildPagination, getPagination } from "../../utils/pagination";
import { parseOrderPayment, type OrderPaymentInfo } from "../../utils/orderPayment";
import {
  parseDeliveryAddressObject,
  parsePartialFulfilment,
  withPartialFulfilment,
  withPaymentBlock,
  type PartialFulfilmentInfo,
  type PartialFulfilmentReducedItem,
  type PartialFulfilmentRemovedItem,
} from "../../utils/partialFulfilment";
import { createAuditLog } from "../audit/audit.service";
import { applyStockMovement } from "../inventory/inventory.service";
import { notifyOrderEvent } from "../../services/order-event-webhook.service";
import { sendPushToDriver, sendPushToOrgStaff } from "../../services/push-notification.service";
import { recordNotificationLog } from "../notifications/notifications.service";

const STALE_READY_ORDER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

interface StockDeductibleOrder {
  id: string;
  branchId: string;
  notes: string | null;
  items: Array<{
    variantId: string;
    quantity: Prisma.Decimal.Value;
    variant: { costPrice: Prisma.Decimal.Value | null };
  }>;
}

/**
 * The ONE place a sales order's stock is deducted. Extracted out of `confirmSalesOrder` (which
 * still calls it, unchanged in behaviour) so the partial-fulfilment accept path — which confirms
 * an order whose items have just been reduced, inside the very same transaction — can reuse it
 * instead of growing a second, drifting copy of the same ledger write.
 *
 * Callers MUST pass items they read back inside their own transaction AFTER atomically claiming
 * the status transition, never a pre-transaction snapshot: the quantities deducted here are what
 * a later cancel reverses, so deducting a stale quantity silently desyncs the immutable ledger
 * from the order (see confirmSalesOrder's own comment for the race this closes).
 */
async function deductStockForSalesOrder(
  tx: DbClient,
  params: { organizationId: string; order: StockDeductibleOrder; actorUserId: string | null },
) {
  for (const item of params.order.items) {
    await applyStockMovement(tx, {
      organizationId: params.organizationId,
      branchId: params.order.branchId,
      variantId: item.variantId,
      movementType: StockMovementType.SALE,
      referenceType: ReferenceType.SALES_ORDER,
      referenceId: params.order.id,
      quantityDelta: toDecimal(item.quantity).negated(),
      unitCost: item.variant.costPrice ?? undefined,
      note: params.order.notes ?? undefined,
      createdById: params.actorUserId ?? undefined,
    });
  }
}

export async function listSalesOrders(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
    branchId?: string | string[];
    customerId?: string;
    status?: SalesOrderStatus;
    paymentStatus?: PaymentStatus;
    source?: OrderSource;
  },
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    // branchId may be a single explicit filter or a branch-scoped caller's allowed-set array —
    // see resolveBranchFilter in utils/branchAccess.ts, wired in from the controller.
    ...(query.branchId
      ? { branchId: Array.isArray(query.branchId) ? { in: query.branchId } : query.branchId }
      : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(query.search
      ? {
          OR: [
            { orderNumber: { contains: query.search } },
            { customer: { name: { contains: query.search } } },
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
    // Bug fix: this used to be a plain `tx.salesOrder.update({where: {id: orderId}})` with no
    // status predicate — so a concurrent confirm/reject/cancel that had already moved the order out
    // of DRAFT/PENDING between the `ensureEditableStatus` check above and this write would be
    // silently overridden: this transaction would still succeed, rewriting items/totals on an order
    // that's no longer editable (e.g. already CONFIRMED, with stock already deducted for the OLD
    // quantities). Guarded the same way every transition function in this file already guards its
    // own status change: atomic `updateMany` re-checking status at write time, conflict if it
    // no longer matches. Confirm/cancel/etc. additionally re-read items fresh inside their own
    // transactions after their claim (see confirmSalesOrder/cancelSalesOrder) so this and those
    // fixes close both directions of the same race.
    const { count } = await tx.salesOrder.updateMany({
      where: { id: orderId, organizationId, status: { in: EDITABLE_ORDER_STATUSES } },
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

    if (count === 0) {
      throw ApiError.conflict(
        "Order is no longer draft/pending — it may have changed status concurrently and can no longer be edited",
      );
    }

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

  const proposal = parsePartialFulfilment(order.deliveryAddress);

  // A proposal the customer has not answered yet must not be confirmable. Without this, a shop
  // that proposed "3 of the 5" and then hit Confirm would commit — and deduct stock for — the
  // ORIGINAL five it had just said it could not supply.
  if (proposal?.state === "AWAITING_CUSTOMER") {
    throw ApiError.conflict(
      "This order is waiting for the customer to accept or decline your revised order",
    );
  }

  const confirmed = await prisma.$transaction(async (tx) => {
    // Guard against a concurrent confirm racing this same transition (e.g. a double-click or a
    // duplicated webhook retry): claim the row atomically before touching stock. `updateMany`
    // compiles to a single atomic `UPDATE ... WHERE` statement, so the status predicate and the
    // write happen as one indivisible step on any engine (Postgres or, post-migration, SQLite/
    // libSQL) — a second concurrent caller's updateMany re-evaluates the predicate against 0
    // matching rows once this one commits and safely no-ops instead of also decrementing stock for
    // the same order. (Unlike `assignDriverToSalesOrder` below, this doesn't need a cross-row
    // NOT EXISTS check, so the plain compare-and-swap here was never Postgres-specific.)
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

    // Bug fix: re-read the order's CURRENT items/branch inside the transaction, right after the
    // atomic claim above, instead of using `order` (read before this transaction even started —
    // and, worse, before this function's own two status checks above it). If a concurrent
    // PATCH /sales-orders/:id changed quantities/branch between that outer read and this claim
    // succeeding, `order.items`/`order.branchId` would be stale — deducting stock for quantities
    // that no longer match what SalesOrderItem actually holds, silently desyncing the immutable
    // ledger from the order (and, on a later cancel, reversing the WRONG — edited — quantity,
    // inflating InventoryBalance.onHand). See updateSalesOrder's own atomic CAS guard for the other
    // half of this race: an edit landing AFTER this claim now correctly fails with a conflict
    // instead of silently overwriting an already-CONFIRMED order's items post-hoc.
    // The customer already approved a reduced order: apply it HERE, inside the same transaction
    // and before the re-read below, so the items and money this confirm commits — and the stock
    // it deducts — are the revised ones. This is the only place a revised order becomes real.
    if (proposal?.state === "CUSTOMER_ACCEPTED") {
      await applyAcceptedPartialFulfilment(tx, orderId, proposal);
    }

    const current = await tx.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: { include: { variant: true } },
        branch: true,
        customer: true,
      },
    });

    await deductStockForSalesOrder(tx, { organizationId, order: current, actorUserId });

    await createAuditLog(tx, {
      organizationId,
      actorUserId,
      action: proposal?.state === "CUSTOMER_ACCEPTED" ? AuditAction.ORDER_PARTIAL_ACCEPT : AuditAction.ORDER_CONFIRM,
      entityType: "SalesOrder",
      entityId: order.id,
      before: order,
      after: current,
    });

    return current;
  }, INTERACTIVE_TRANSACTION_OPTIONS);

  if (confirmed.externalOrderId) {
    void notifyOrderEvent({
      externalOrderId: confirmed.externalOrderId,
      status: confirmed.status,
      eventType: "CONFIRMED",
      // Carries the now-ACCEPTED proposal so NearCart can settle its own copy of the order to the
      // revised lines in the same beat it learns the order was confirmed.
      partialFulfilment: parsePartialFulfilment(confirmed.deliveryAddress),
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

  // Bug fixed: this used to be a plain `prisma.salesOrder.update` after the status checks above,
  // with no re-check of status at write time — a classic TOCTOU race against `confirmSalesOrder`
  // (which DOES atomically compare-and-swap). Two concurrent requests — a staff member clicking
  // Confirm while another clicks Reject, or the order-confirmation-sweep cron auto-rejecting the
  // same order a staff member is confirming — could both pass their own status check against the
  // same stale read, then confirm decrements stock and this unconditional update would overwrite
  // status back to REJECTED afterward, leaving a REJECTED order with stock already deducted and no
  // reversal (REJECTED is defined as "nothing was ever deducted, no reversal needed"). Guarded the
  // same way `confirmSalesOrder`/`markSalesOrderReady` already are: an atomic `updateMany` that
  // only succeeds if the row is still in an editable status at the moment of the write itself.
  const { count } = await prisma.salesOrder.updateMany({
    where: { id: orderId, organizationId, status: { in: EDITABLE_ORDER_STATUSES } },
    data: {
      status: SalesOrderStatus.REJECTED,
      rejectionReason,
    },
  });

  if (count === 0) {
    throw ApiError.conflict("Order is no longer draft/pending — it may have already been confirmed or rejected");
  }

  const updated = await prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId } });

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
    // Bug fixed: this previously decided whether to reverse stock, and then whether to write
    // CANCELLED at all, purely from the `order` snapshot read by `getSalesOrderById` BEFORE this
    // transaction started — with no re-check of status at write time. That's a TOCTOU race against
    // every other transition (confirm/reject/mark-ready/deliver), all of which DO atomically
    // compare-and-swap their own status change. Concretely: if this order was CONFIRMED (stock
    // already deducted) at read time but gets DELIVERED by someone else before this transaction's
    // final `update` runs, the stale `order.status` still says CONFIRMED, so this code reverses
    // stock for an order that was actually delivered (double-dipping the ledger) and then
    // unconditionally overwrites DELIVERED back to CANCELLED — corrupting both the order status
    // and the stock count for an item that was physically handed to the customer.
    //
    // Fixed by claiming the row atomically FIRST via `updateMany`, split into the two disjoint
    // status sets that determine whether a reversal is owed (mirrors the same "atomic UPDATE...
    // WHERE decides the transition" pattern already used by confirmSalesOrder/markSalesOrderReady/
    // assignDriverToSalesOrder). Only the branch whose `updateMany` actually matched a row tells us
    // which prior state we truly claimed — not the pre-transaction snapshot.
    const deductedClaim = await tx.salesOrder.updateMany({
      where: { id: orderId, organizationId, status: { in: CANCELLABLE_STOCK_REVERSAL_STATUSES } },
      data: { status: SalesOrderStatus.CANCELLED },
    });

    const stockWasDeducted = deductedClaim.count > 0;

    if (!stockWasDeducted) {
      const undeductedClaim = await tx.salesOrder.updateMany({
        where: { id: orderId, organizationId, status: { in: EDITABLE_ORDER_STATUSES } },
        data: { status: SalesOrderStatus.CANCELLED },
      });

      if (undeductedClaim.count === 0) {
        throw ApiError.conflict("Order can no longer be cancelled — its status changed concurrently");
      }
    }

    // Bug fix: re-read current items (with variant costPrice) inside the tx, AFTER whichever claim
    // above succeeded, instead of the pre-transaction `order.items` snapshot — see
    // confirmSalesOrder's fuller rationale for this same pattern. Matters here specifically because
    // the quantity being reversed must match what was actually deducted at confirm time, which
    // reflects the CURRENT SalesOrderItem rows, not whatever this function's own outer read
    // happened to see before a concurrent edit (now itself guarded — see updateSalesOrder) landed.
    const updated = await tx.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { include: { variant: true } } },
    });

    if (stockWasDeducted) {
      for (const item of updated.items) {
        await applyStockMovement(tx, {
          organizationId,
          branchId: updated.branchId,
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

  // Only staff-initiated cancels need to be echoed back — a bridge-initiated cancel (actorUserId
  // null, "Cancelled via NearCart customer app") originated from NearCart itself, which already
  // knows its own order was cancelled and doesn't need to be told about it again.
  if (actorUserId && cancelled.externalOrderId) {
    void notifyOrderEvent({
      externalOrderId: cancelled.externalOrderId,
      status: cancelled.status,
      eventType: "CANCELLED",
    });
  }

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

  // Bug fixed: same TOCTOU class as reject/cancel above — this used to be an unconditional
  // `prisma.salesOrder.update` after the status checks, so e.g. a concurrent cancel racing this
  // deliver (both reading the same pre-transition status) could overwrite each other's terminal
  // state depending on write order, or two concurrent deliver calls could both "succeed" past the
  // already-delivered guard. Guarded with the same atomic-`updateMany`-then-conflict pattern used
  // throughout this file.
  const { count } = await prisma.salesOrder.updateMany({
    where: { id: orderId, organizationId, status: { in: DELIVERABLE_ORDER_STATUSES } },
    data: {
      status: SalesOrderStatus.DELIVERED,
      deliveredAt: new Date(),
      deliveredById: actorUserId,
    },
  });

  if (count === 0) {
    throw ApiError.conflict("Order is no longer in a deliverable state — it may have already been delivered or cancelled");
  }

  const updated = await prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId } });

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
      // Staff-initiated deliver (as opposed to the driver-app flow in
      // driver-orders.service.ts's deliverDriverOrder) never captures a new photo itself, but
      // carries whatever's already on the row for consistency with that other DELIVERED sender —
      // see NotifyOrderEventInput's doc comment.
      deliveryProofPhotoUrl: updated.deliveryProofPhotoUrl,
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
 * Clamps a linear base+per-km driver fare between DRIVER_FARE_MIN/MAX (see config/env.ts's doc
 * comment on those four DRIVER_FARE_* vars). Called once from `markSalesOrderReady` at mark-ready
 * time using the branch↔delivery-address distance — NOT the same distance
 * `findNearestFreeDriver` computes (branch↔candidate-driver, for matching purposes only). Rounded
 * to 2 decimal places since this feeds a `Decimal` money column (`SalesOrder.driverDeliveryFee`).
 */
function computeDriverFare(distanceKm: number): number {
  const raw = env.DRIVER_FARE_BASE + env.DRIVER_FARE_PER_KM * distanceKm;
  const clamped = Math.min(Math.max(raw, env.DRIVER_FARE_MIN), env.DRIVER_FARE_MAX);
  return Math.round(clamped * 100) / 100;
}

/**
 * Parses `SalesOrder.deliveryAddress` (a `Json?` column shaped `{ addressLine, latitude,
 * longitude }`, see the doc comment on that column in schema.prisma) back into just the
 * coordinates needed for fare calculation. Tolerant of null/malformed values (pre-migration rows
 * with no deliveryAddress at all, or a row where latitude/longitude were never supplied) — returns
 * null rather than throwing, mirroring `parseDeclinedDriverIds` below: a fare-calculation read
 * should never be able to break the mark-ready transition itself.
 *
 * Bug found live 2026-08-15: this always returned null in production, confirmed by direct repro
 * (fresh order, valid deliveryAddress and branch coordinates both present, fare fields still
 * came back null). Root cause: `typeof deliveryAddress !== "object"` was tripping because the
 * value read back through this codebase's Prisma+libSQL/Turso adapter setup was a raw JSON
 * *string*, not an already-parsed object, in at least some cases — the exact conditions weren't
 * fully pinned down, so this now handles the string case defensively via JSON.parse rather than
 * assuming Prisma always deserializes `Json?` columns before this function sees them.
 */
function parseDeliveryAddressCoords(
  deliveryAddress: unknown,
): { latitude: number; longitude: number } | null {
  let value = deliveryAddress;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { latitude, longitude } = value as Record<string, unknown>;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }
  return { latitude, longitude };
}

/**
 * Parses `SalesOrder.declinedByDriverIds` (a `Json?` column storing a plain string array of
 * `Driver.id`s who have ever declined that specific order) back into a string array. Tolerant of
 * null/malformed values (pre-migration rows, or any future manual DB edit) — falls back to an
 * empty array rather than throwing, since a decline-history read should never be able to break
 * order-matching.
 *
 * Bug found live 2026-08-15 (same root cause as parseDeliveryAddressCoords above): this silently
 * returned `[]` in production even for orders with a real, previously-written decline history,
 * because the value read back through this codebase's Prisma+libSQL/Turso setup was a raw JSON
 * *string* in at least some cases, and `Array.isArray("...")` is always false on a string. That
 * broke the "never re-offer to a driver who already declined" guarantee — a declined order could
 * bounce right back to the same driver. Now handles the string case via JSON.parse first.
 */
export function parseDeclinedDriverIds(value: unknown): string[] {
  let parsed = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Ranks currently-free, VERIFIED drivers by distance from a branch's pickup-point coordinates and
 * returns the closest one within `DRIVER_MATCH_RADIUS_KM`, or `null` if the branch has no
 * coordinates set, no driver is free, or no free driver is within radius. "Free" = a driver has
 * `isAvailableForAssignment: true` and no `SalesOrder` currently assigned to them with status
 * READY/OUT_FOR_DELIVERY (see the `Driver.assignedOrders` relation). Called automatically from
 * `markSalesOrderReady` below — the existing manual assign-driver dropdown in the Inventory
 * frontend remains available as a fallback when this returns null.
 *
 * `excludeDriverIds` — bug fixed 2026-08-07: this used to be a single `excludeDriverId?: string`,
 * only ever excluding whichever driver had JUST declined THIS SPECIFIC call. That let two drivers
 * ping-pong an order back and forth: driver A declines (excluded, reassigned to B) -> driver B
 * also declines (only B is excluded this time, A is free again) -> A gets re-matched to the exact
 * order they already turned down, with no memory of it. Callers should now pass the FULL
 * accumulated decline history for the order (see `parseDeclinedDriverIds` +
 * `SalesOrder.declinedByDriverIds`), not just the latest decliner.
 */
export async function findNearestFreeDriver(
  branchId: string,
  excludeDriverIds: string[] = [],
): Promise<{ id: string } | null> {
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
      // Bug found live 2026-08-09: a driver whose location ping went silent (app killed, dead
      // phone, no network) while still toggled "available" used to keep matching here forever on
      // whatever coordinates it last reported, however old. The app pings ~once/minute while
      // online (see updateDriverLocation), so anything older than DRIVER_LOCATION_STALE_MINUTES
      // means the driver has effectively gone dark — treat them the same as "no location" rather
      // than trusting a stale fix.
      lastLocationAt: { gte: new Date(Date.now() - env.DRIVER_LOCATION_STALE_MINUTES * 60_000) },
      // Excludes every driver who has ever declined this exact order (see
      // driver-orders.service.ts declineDriverOrder + SalesOrder.declinedByDriverIds) — not just
      // the single most recent decliner, so a small pool of drivers can't get bounced the same
      // order back and forth indefinitely.
      ...(excludeDriverIds.length > 0 ? { id: { notIn: excludeDriverIds } } : {}),
      // Shop-owned drivers (2026-09-24) only ever carry their own branch's orders; for that branch
      // they compete with general drivers on distance like anyone else.
      OR: [{ shopBranchId: null }, { shopBranchId: branchId }],
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
 * Fix (2026-08-07, E2E_SCENARIOS_FAILURE_EDGECASES.md C4): the inverse of `findNearestFreeDriver`
 * above — instead of "given a READY order, find the nearest free driver", this is "given a driver
 * who just came online, find the nearest READY-and-unassigned order they could take". Called from
 * `updateDriverAvailability` below right after a driver flips online, since previously nothing
 * ever re-ran matching when a driver became available again — an order that went READY while 0
 * drivers were online would sit unassigned forever unless a manager manually intervened.
 *
 * Deliberately narrow in scope per the fix's own instructions: matches AT MOST ONE order (the
 * nearest eligible one) to this one driver — not a full re-balancing sweep across every
 * READY-unassigned order and every online driver, which is a materially bigger feature. Reuses the
 * same radius/distance/eligibility rules as the forward path: branch must have coordinates, order
 * must be within `DRIVER_MATCH_RADIUS_KM` of the driver's last known location, and this driver
 * must not be in that specific order's `declinedByDriverIds` history (mirrors
 * `findNearestFreeDriver`'s exclusion — a driver coming back online shouldn't be immediately
 * handed an order they already turned down).
 */
export async function findNearestUnassignedOrderForDriver(
  driverId: string,
  driverLocation: { latitude: number; longitude: number },
): Promise<{ id: string } | null> {
  const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { shopBranchId: true } });

  const candidates = await prisma.salesOrder.findMany({
    where: {
      status: SalesOrderStatus.READY,
      assignedDriverId: null,
      // OWN_DRIVER orders wait for the shop to pick; nothing is auto-assigned to them.
      OR: [{ driverDispatchMode: null }, { driverDispatchMode: DriverDispatchMode.NEARCART }],
      // A shop-owned driver only ever gets their own branch's orders.
      ...(driver?.shopBranchId ? { branchId: driver.shopBranchId } : {}),
      // Hyperlocal orders are same-day. Without an age cap, a READY order nobody ever collected
      // was pushed to whichever driver next came online — on-device 2026-09-20 a driver going
      // online was handed a 5-week-old order. Older ones need a human (shop cancels/reassigns).
      createdAt: { gte: new Date(Date.now() - STALE_READY_ORDER_MAX_AGE_MS) },
      branch: {
        latitude: { not: null },
        longitude: { not: null },
      },
    },
    select: {
      id: true,
      declinedByDriverIds: true,
      branch: { select: { latitude: true, longitude: true } },
    },
  });

  let nearest: { id: string; distanceKm: number } | null = null;

  for (const candidate of candidates) {
    if (candidate.branch.latitude == null || candidate.branch.longitude == null) {
      continue;
    }

    if (parseDeclinedDriverIds(candidate.declinedByDriverIds).includes(driverId)) {
      continue;
    }

    const distanceKm = haversineDistanceKm(driverLocation, {
      latitude: candidate.branch.latitude,
      longitude: candidate.branch.longitude,
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

type AutoAssignFailureReason = "NO_BRANCH_COORDINATES" | "NO_DRIVER_AVAILABLE";

/**
 * Re-derives WHY `findNearestFreeDriver` came back empty, for the human-facing notification below
 * — `findNearestFreeDriver` itself just returns `null` either way, which is fine for the
 * auto-assign control flow but not descriptive enough for a staff-facing alert. Cheap (single
 * indexed row lookup), only ever called on the rare failure path, so re-checking branch
 * coordinates here rather than threading a reason code through `findNearestFreeDriver`'s return
 * type (which every other caller would then have to unpack) is the simpler tradeoff.
 */
async function determineAutoAssignFailureReason(branchId: string): Promise<AutoAssignFailureReason> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { latitude: true, longitude: true },
  });

  if (!branch || branch.latitude == null || branch.longitude == null) {
    return "NO_BRANCH_COORDINATES";
  }

  return "NO_DRIVER_AVAILABLE";
}

/**
 * Fix (2026-08-07, E2E_SCENARIOS_CONTEXTUAL.md B6 / FAILURE_EDGECASES.md C4): previously, when
 * auto-assignment found no match, a READY order was left completely invisible — no audit log
 * entry beyond the unremarkable ORDER_READY transition, no notification, nothing. A human could
 * only discover the gap by opening that exact order's detail page. This writes an
 * ORDER_AUTOASSIGN_FAILED audit entry AND a NEW_ORDER-style NotificationLog + push to org staff,
 * reusing the exact same record+push pattern `createBridgedSalesOrder` already uses for new-order
 * alerts (see marketplace.service.ts) rather than inventing a second alerting mechanism.
 * Best-effort/never-throws: called from a context where auto-assignment has already failed, so a
 * failure here must not turn that into a harder error.
 *
 * Exported (2026-08-08 bug-hunt sweep): originally only called from `markSalesOrderReady` below,
 * but `declineDriverOrder`'s own failed-rematch path (driver-orders.service.ts) left the exact
 * same READY-and-unassigned state with zero trace — arguably the MORE common way an order ends up
 * stuck, since it requires an active decline rather than just an empty driver pool at ready-time.
 * Exporting so both call sites share one alerting path instead of drifting into two.
 */
export async function notifyStaffOfAutoAssignFailure(
  organizationId: string,
  order: { id: string; orderNumber: string; branchId: string },
): Promise<void> {
  try {
    const reason = await determineAutoAssignFailureReason(order.branchId);

    await createAuditLog(prisma, {
      organizationId,
      action: AuditAction.ORDER_AUTOASSIGN_FAILED,
      entityType: "SalesOrder",
      entityId: order.id,
      meta: { reason },
    });

    const title = "Driver auto-assignment failed";
    const body = `Order #${order.orderNumber} is ready but no driver could be auto-assigned — assign manually.`;
    const data = { salesOrderId: order.id, reason };

    void sendPushToOrgStaff(organizationId, {
      title,
      body,
      data,
      channelId: "order_alert",
    }).catch((error) => {
      console.warn(
        `[sales-orders] Failed to push auto-assign-failure alert to org staff for order ${order.id}`,
        error,
      );
    });

    await recordNotificationLog(prisma, {
      organizationId,
      type: NotificationLogType.ORDER_AUTOASSIGN_FAILED,
      title,
      body,
      data,
    });
  } catch (error) {
    console.warn(
      `[sales-orders] Failed to record auto-assign-failure notification for order ${order.id}`,
      error,
    );
  }
}

export type OwnDriverNeededReason = "UNAVAILABLE" | "DECLINED" | "TIMED_OUT";

/**
 * OWN_DRIVER orders are never auto-reassigned: when the picked driver can't take it, declines, or
 * times out, the order goes back to the shop to choose again (owner's rule, 2026-09-24). Same
 * audit + push + NotificationLog trail as notifyStaffOfAutoAssignFailure, so the partner app's
 * existing alert (which opens the order) just works. Best-effort, never throws.
 */
export async function notifyStaffOwnDriverNeeded(
  organizationId: string,
  order: { id: string; orderNumber: string },
  reason: OwnDriverNeededReason,
  driverName?: string | null,
): Promise<void> {
  try {
    await createAuditLog(prisma, {
      organizationId,
      action: AuditAction.ORDER_AUTOASSIGN_FAILED,
      entityType: "SalesOrder",
      entityId: order.id,
      meta: { reason: `OWN_DRIVER_${reason}` },
    });

    const who = driverName ?? "Your driver";
    const title = "Pick a driver";
    const body =
      reason === "DECLINED"
        ? `${who} declined order #${order.orderNumber}. Pick another of your drivers or let NearCart choose.`
        : reason === "TIMED_OUT"
          ? `${who} didn't respond to order #${order.orderNumber}. Pick another of your drivers or let NearCart choose.`
          : `Order #${order.orderNumber} is packed but your driver couldn't take it. Pick another driver or let NearCart choose.`;
    const data = { salesOrderId: order.id, reason: `OWN_DRIVER_${reason}` };

    void sendPushToOrgStaff(organizationId, { title, body, data, channelId: "order_alert" }).catch((error) => {
      console.warn(`[sales-orders] Failed to push own-driver alert for order ${order.id}`, error);
    });

    await recordNotificationLog(prisma, {
      organizationId,
      type: NotificationLogType.ORDER_AUTOASSIGN_FAILED,
      title,
      body,
      data,
    });
  } catch (error) {
    console.warn(`[sales-orders] Failed to record own-driver notification for order ${order.id}`, error);
  }
}

/**
 * The shop's pick for an OWN_DRIVER order must be one of that branch's own drivers, approved, and
 * online and free right now — the same things the picker greys out, re-checked here because the
 * list can be seconds stale. Checked BEFORE any state change so a bad pick leaves the order as-is.
 */
async function assertOwnDriverAvailable(branchId: string, driverId: string) {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: {
      fullName: true,
      status: true,
      shopBranchId: true,
      isAvailableForAssignment: true,
      lastLocationAt: true,
      _count: { select: { assignedOrders: { where: { status: { in: ACTIVE_DRIVER_ORDER_STATUSES } } } } },
    },
  });

  if (!driver || driver.shopBranchId !== branchId) {
    throw ApiError.badRequest("That driver isn't one of this branch's drivers.");
  }
  if (driver.status !== DriverStatus.VERIFIED) {
    throw ApiError.badRequest(`${driver.fullName} hasn't been approved by NearCart yet.`);
  }
  const isFresh =
    driver.lastLocationAt != null &&
    driver.lastLocationAt.getTime() >= Date.now() - env.DRIVER_LOCATION_STALE_MINUTES * 60_000;
  if (!driver.isAvailableForAssignment || !isFresh) {
    throw ApiError.conflict(`${driver.fullName} is offline right now. Pick another driver or let NearCart choose.`);
  }
  if (driver._count.assignedOrders > 0) {
    throw ApiError.conflict(`${driver.fullName} is already on a delivery. Pick another driver or let NearCart choose.`);
  }
}

export interface DispatchChoice {
  mode?: DriverDispatchMode;
  driverId?: string;
}

/**
 * Transitions CONFIRMED -> READY, the first of the two previously-dead SalesOrderStatus
 * transitions to get wired up. Separate step from assign-driver (below) since the shop may mark
 * an order ready for pickup before a driver has been assigned — matching the locked
 * PHASE1_REQUIREMENTS.md contract (`PATCH /:id/mark-ready` is distinct from
 * `POST /:id/assign-driver`).
 */
export async function markSalesOrderReady(
  organizationId: string,
  orderId: string,
  actorUserId: string,
  dispatch: DispatchChoice = {},
) {
  const order = await getSalesOrderById(organizationId, orderId);

  if (order.status !== SalesOrderStatus.CONFIRMED) {
    throw ApiError.badRequest("Only confirmed orders can be marked ready");
  }

  // "Let NearCart choose" is the default, so callers that send no choice (the web dashboard, older
  // app builds) keep today's behaviour exactly.
  const dispatchMode = dispatch.mode ?? DriverDispatchMode.NEARCART;

  if (dispatchMode === DriverDispatchMode.OWN_DRIVER) {
    if (!dispatch.driverId) {
      throw ApiError.badRequest("Pick one of your drivers.");
    }
    await assertOwnDriverAvailable(order.branchId, dispatch.driverId);
  }

  // Distance-based driver fare (branch pickup-point <-> delivery address), computed here — before
  // entering the transaction — so it can be written as literal data in the same atomic
  // `updateMany` below rather than a separate round-trip. Both null when either coordinate set is
  // missing (see doc comments on SalesOrder.estimatedDistanceKm/driverDeliveryFee in
  // schema.prisma); the earnings summary falls back to the flat DRIVER_DELIVERY_FEE rate for those
  // rows. Deliberately distinct from findNearestFreeDriver's branch<->candidate-driver distance —
  // do not conflate the two.
  const branchCoords =
    order.branch?.latitude != null && order.branch?.longitude != null
      ? { latitude: order.branch.latitude, longitude: order.branch.longitude }
      : null;
  const deliveryCoords = parseDeliveryAddressCoords(order.deliveryAddress);
  const estimatedDistanceKm =
    branchCoords && deliveryCoords ? haversineDistanceKm(branchCoords, deliveryCoords) : null;
  const driverDeliveryFee = estimatedDistanceKm != null ? computeDriverFare(estimatedDistanceKm) : null;

  const updated = await prisma.$transaction(async (tx) => {
    // Guard against a concurrent request racing this same transition: `updateMany` compiles to a
    // single atomic `UPDATE ... WHERE` statement on any engine, so only one concurrent caller can
    // ever flip CONFIRMED -> READY for this row.
    const { count } = await tx.salesOrder.updateMany({
      where: { id: orderId, organizationId, status: SalesOrderStatus.CONFIRMED },
      data: {
        status: SalesOrderStatus.READY,
        readyAt: new Date(),
        readyById: actorUserId,
        estimatedDistanceKm,
        driverDeliveryFee: driverDeliveryFee != null ? toDecimal(driverDeliveryFee) : null,
        driverDispatchMode: dispatchMode,
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

  if (dispatchMode === DriverDispatchMode.OWN_DRIVER) {
    try {
      return await assignDriverToSalesOrder(organizationId, updated.id, actorUserId, dispatch.driverId!);
    } catch (error) {
      // Lost a race since the pre-check (the driver just took another order or went offline).
      // The order is packed either way; leave it READY and ask the shop to pick again.
      console.warn(`[sales-orders] Own-driver assignment failed for order ${updated.id}`, error);
      void notifyStaffOwnDriverNeeded(organizationId, updated, "UNAVAILABLE");
      return updated;
    }
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

  // No driver got assigned — either findNearestFreeDriver came back empty (no branch coordinates
  // or no free driver in range) or assignDriverToSalesOrder itself threw (e.g. a race against
  // another concurrent assignment). Either way the order is READY-and-unassigned with nothing
  // else pointing a human at it — see notifyStaffOfAutoAssignFailure's doc comment.
  void notifyStaffOfAutoAssignFailure(organizationId, updated);

  return updated;
}

/**
 * Re-dispatch a READY order that has no driver — after an own driver declined/timed out, or when
 * the shop changes its mind. OWN_DRIVER assigns the picked driver (or fails with the reason, order
 * untouched); NEARCART runs the same nearest-free-driver match as mark-ready.
 */
export async function dispatchSalesOrder(
  organizationId: string,
  orderId: string,
  actorUserId: string,
  dispatch: { mode: DriverDispatchMode; driverId?: string },
) {
  const order = await getSalesOrderById(organizationId, orderId);

  if (order.status !== SalesOrderStatus.READY) {
    throw ApiError.badRequest("Only packed orders waiting for a driver can be dispatched");
  }
  if (order.assignedDriverId) {
    throw ApiError.conflict("This order already has a driver");
  }

  if (dispatch.mode === DriverDispatchMode.OWN_DRIVER) {
    if (!dispatch.driverId) {
      throw ApiError.badRequest("Pick one of your drivers.");
    }
    await assertOwnDriverAvailable(order.branchId, dispatch.driverId);
  }

  await prisma.salesOrder.updateMany({
    where: { id: orderId, organizationId, status: SalesOrderStatus.READY, assignedDriverId: null },
    data: { driverDispatchMode: dispatch.mode },
  });

  if (dispatch.mode === DriverDispatchMode.OWN_DRIVER) {
    return assignDriverToSalesOrder(organizationId, orderId, actorUserId, dispatch.driverId!);
  }

  try {
    const nearestDriver = await findNearestFreeDriver(
      order.branchId,
      parseDeclinedDriverIds(order.declinedByDriverIds),
    );
    if (nearestDriver) {
      return await assignDriverToSalesOrder(organizationId, orderId, null, nearestDriver.id);
    }
  } catch (error) {
    console.warn(`[sales-orders] Nearest-free-driver match on re-dispatch failed for order ${orderId}`, error);
  }

  const current = await getSalesOrderById(organizationId, orderId);
  void notifyStaffOfAutoAssignFailure(organizationId, current);
  return current;
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
    select: { id: true, status: true, shopBranchId: true },
  });

  if (!driver) {
    throw ApiError.notFound("Driver not found");
  }

  if (driver.status !== DriverStatus.VERIFIED) {
    throw ApiError.badRequest("Only verified drivers can be assigned to orders");
  }

  // Shop-owned drivers (2026-09-24): never another shop's orders; and an OWN_DRIVER order only
  // ever goes to the branch's own drivers.
  if (driver.shopBranchId && driver.shopBranchId !== order.branchId) {
    throw ApiError.badRequest("This driver works only for another shop");
  }
  if (order.driverDispatchMode === DriverDispatchMode.OWN_DRIVER && driver.shopBranchId !== order.branchId) {
    throw ApiError.badRequest("This order is set to use your own drivers. Pick one of them or let NearCart choose.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Bug fixed 2026-07-28: this previously took a Postgres row lock via
    // `tx.$queryRaw\`SELECT id FROM "Driver" WHERE id = ${driverId} FOR UPDATE\`` to serialize
    // concurrent assignment attempts for the same driver before re-checking activeAssignmentCount.
    // `FOR UPDATE` is not valid SQLite/libSQL syntax at all — verified live against this Turso DB,
    // it throws `SQL_PARSE_ERROR: near FOR` — so since today's Postgres -> Turso migration this
    // function has thrown on literally every call, not just raced under concurrency. Even setting
    // that aside, SQLite/libSQL has no per-row locking to fall back to (locking is whole-database),
    // so a straight port to some other "lock the row" primitive wouldn't have closed the race
    // either. Fixed by folding the "driver has no other active delivery" check into the SAME atomic
    // UPDATE statement that flips READY -> assigned via a NOT EXISTS subquery: a single SQL
    // statement is atomic on SQLite/libSQL regardless of isolation level, so the check-then-set race
    // is closed by the statement itself rather than by a preceding lock. Verified this exact
    // UPDATE...NOT EXISTS shape parses and executes against the live Turso DB.
    const affected = await tx.$executeRaw`
      UPDATE "SalesOrder"
      SET "assignedDriverId" = ${driverId},
          "assignedById" = ${actorUserId},
          "assignedAt" = ${new Date()}
      WHERE "id" = ${orderId}
        AND "organizationId" = ${organizationId}
        AND "status" = ${SalesOrderStatus.READY}
        AND NOT EXISTS (
          SELECT 1 FROM "SalesOrder" AS "other"
          WHERE "other"."assignedDriverId" = ${driverId}
            AND "other"."id" != ${orderId}
            AND "other"."status" IN (${SalesOrderStatus.READY}, ${SalesOrderStatus.OUT_FOR_DELIVERY})
        )
    `;

    if (affected === 0) {
      // The atomic UPDATE above is what actually prevents double-booking; this second read is
      // best-effort and only picks which error message to surface (a tiny race window exists
      // between the UPDATE and this SELECT, but it can only misattribute the reason, never allow
      // an incorrect assignment through).
      const stillReady = await tx.salesOrder.findFirst({
        where: { id: orderId, organizationId, status: SalesOrderStatus.READY },
        select: { id: true },
      });

      if (!stillReady) {
        throw ApiError.conflict("Order is no longer READY — it may have already been assigned or its state changed");
      }

      throw ApiError.conflict("Driver already has another active delivery assigned");
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

  // `sendPushToDriver` only wraps the actual Expo API call in a try/catch internally — its
  // leading `deviceToken.findMany` lookup is not guarded, so a transient DB error there would
  // otherwise become an unhandled promise rejection on this fire-and-forget call and crash the
  // process (same bug class documented elsewhere this session).
  void sendPushToDriver(driverId, {
    title: "New delivery assigned",
    body: `You've been assigned order #${updated.orderNumber}.`,
    data: { salesOrderId: updated.id },
    channelId: "order_alert",
  }).catch((error) => {
    console.warn(`[sales-orders] Failed to notify driver ${driverId} of assignment for order ${updated.id}`, error);
  });

  return updated;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Shop-side PARTIAL FULFILMENT with customer approval.
 *
 * "The customer ordered 5 things, I only have 3 of them." Instead of confirming (which would
 * deduct stock the shop doesn't have and hand the customer an order they never agreed to) or
 * rejecting outright (which loses the sale), the shop proposes a REDUCED order and the customer
 * approves or refuses it in the NearCart app.
 *
 * Three invariants hold this together, and all three are load-bearing:
 *
 *  1. The order STAYS `PENDING` for the whole negotiation. Nothing is committed until the
 *     customer says yes, so `SalesOrderStatus` needs no new value — and therefore this feature
 *     needs no migration, which matters a lot on this repo's hand-applied-DDL Turso database.
 *     The proposal lives in the existing `SalesOrder.deliveryAddress` Json column, the same
 *     precedent the `payment` block already set (see utils/orderPayment.ts).
 *  2. STOCK ONLY MOVES ON ACCEPTANCE, for the FINAL quantities, exactly once — through the same
 *     `deductStockForSalesOrder` helper `confirmSalesOrder` uses. Proposing touches neither
 *     `InventoryLedger` nor `SalesOrderItem`: a proposal the customer refuses must leave the
 *     order's books completely untouched.
 *  3. The order-confirmation sweep must NOT auto-cancel an order that is waiting on a customer.
 *     Proposing pushes `confirmationDeadlineAt` out to the proposal's own `expiresAt`, and the
 *     sweep additionally skips any order still legitimately AWAITING_CUSTOMER — see
 *     jobs/order-confirmation-sweep.ts. Getting that wrong silently kills live orders.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

const PARTIAL_DECLINE_REASON = "Customer declined the revised order";
const PARTIAL_EXPIRY_REASON = "Customer did not respond to the revised order";
/**
 * How long the shop gets to confirm a revised order the customer has already approved. The
 * customer has said yes and is waiting, so this is deliberately tighter than a fresh order's SLA
 * — the sweep's normal auto-cancel then applies, which is the correct outcome: a shop that has
 * gone quiet after promising a reduced order should release the customer, not hold them.
 */
const PARTIAL_SHOP_CONFIRM_WINDOW_MS = 30 * 60 * 1000;

function decimalToNumber(value: Prisma.Decimal.Value | null | undefined): number {
  return Number(toDecimal(value).toString());
}

/** Money is stored as `Decimal` but travels to the clients as JSON numbers — keep it to paise. */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

interface PartialFulfilmentItemInput {
  salesOrderItemId: string;
  /** 0 means "cannot supply this at all". */
  availableQuantity: string | number;
}

type PartialFulfilmentOrderItem = {
  id: string;
  productId: string;
  variantId: string;
  productNameSnapshot: string;
  variantNameSnapshot: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
};

interface RecomputedLine {
  item: PartialFulfilmentOrderItem;
  toQuantity: Prisma.Decimal;
  lineBase: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

/**
 * Re-derives one line's money at a reduced quantity, following `prepareSalesOrderItems`' formula
 * exactly (lineBase - discount + tax). The per-line `discountAmount` is an absolute figure, so it
 * is scaled by the quantity ratio — the only sane reading of "half the units, half the line
 * discount". Bridged NearCart orders carry `taxRate`/`discountAmount` of 0 on every line (see
 * createBridgedSalesOrder), so for them this reduces to quantity × unitPrice.
 */
function recomputeLine(item: PartialFulfilmentOrderItem, toQuantity: Prisma.Decimal): RecomputedLine {
  const originalQuantity = toDecimal(item.quantity);
  const lineBase = toQuantity.mul(item.unitPrice);
  const discountAmount = originalQuantity.isZero()
    ? toDecimal(0)
    : toDecimal(item.discountAmount).mul(toQuantity).div(originalQuantity);
  const taxAmount = lineBase.mul(item.taxRate).div(100);

  return {
    item,
    toQuantity,
    lineBase,
    discountAmount,
    taxAmount,
    lineTotal: lineBase.minus(discountAmount).plus(taxAmount),
  };
}

function sumLines(lines: RecomputedLine[]) {
  return lines.reduce(
    (totals, line) => ({
      subtotal: totals.subtotal.plus(line.lineBase),
      taxTotal: totals.taxTotal.plus(line.taxAmount),
      discountTotal: totals.discountTotal.plus(line.discountAmount),
      total: totals.total.plus(line.lineTotal),
    }),
    { subtotal: toDecimal(0), taxTotal: toDecimal(0), discountTotal: toDecimal(0), total: toDecimal(0) },
  );
}

/**
 * What the customer would owe if they accept. Only the ITEM total changes — the delivery fee and
 * any weather surcharge stay exactly as they were, because a driver still makes the same ride to
 * the same address. Returns null when the order has no `payment` block at all (a walk-in/phone
 * order, or a push from a NearCart old enough to predate that block): there is no
 * "amount payable" concept for those, and inventing one would be worse than saying nothing.
 */
function computeProposedAmountPayable(payment: OrderPaymentInfo | null, proposedItemTotal: number): number | null {
  if (!payment || payment.amountPayable == null) {
    return null;
  }

  const gross = proposedItemTotal + (payment.deliveryFee ?? 0) + (payment.weatherSurchargeFee ?? 0);

  // A discount can never exceed what is left of the order — otherwise a big enough coupon on a
  // heavily-reduced basket would hand the customer money. NearCart re-checks its own coupon
  // minimum-spend rules on top of this (see its partial-response service); this is the backstop.
  return roundMoney(Math.max(0, gross - Math.min(payment.discountTotal ?? 0, gross)));
}

/**
 * Builds the proposal payload from a shop's `{ salesOrderItemId, availableQuantity }` list.
 * Validation-only — it writes nothing.
 */
function buildPartialFulfilmentProposal(
  order: { total: Prisma.Decimal; deliveryAddress: unknown; items: PartialFulfilmentOrderItem[] },
  input: { items: PartialFulfilmentItemInput[]; note?: string | null },
) {
  const itemsById = new Map(order.items.map((item) => [item.id, item]));
  const requestedById = new Map<string, Prisma.Decimal>();

  for (const requested of input.items) {
    const item = itemsById.get(requested.salesOrderItemId);

    if (!item) {
      throw ApiError.badRequest("One of the items in this proposal is not part of this order");
    }

    if (requestedById.has(requested.salesOrderItemId)) {
      throw ApiError.badRequest("Each item can only appear once in a partial-fulfilment proposal");
    }

    const availableQuantity = toDecimal(requested.availableQuantity);

    if (availableQuantity.isNegative()) {
      throw ApiError.badRequest("Available quantity cannot be negative");
    }

    if (availableQuantity.greaterThan(item.quantity)) {
      throw ApiError.badRequest(
        `You cannot supply more ${item.productNameSnapshot} than the customer ordered — use the ordered quantity or less`,
      );
    }

    requestedById.set(requested.salesOrderItemId, availableQuantity);
  }

  // Items the shop said nothing about are unchanged — a proposal only ever has to name what it
  // is changing.
  const lines = order.items.map((item) => recomputeLine(item, requestedById.get(item.id) ?? toDecimal(item.quantity)));
  const keptLines = lines.filter((line) => line.toQuantity.greaterThan(0));

  if (keptLines.length === 0) {
    throw ApiError.badRequest(
      "You cannot supply any of this order — reject the order instead of proposing a partial fulfilment",
    );
  }

  const changedLines = lines.filter((line) => !line.toQuantity.equals(toDecimal(line.item.quantity)));

  if (changedLines.length === 0) {
    throw ApiError.badRequest(
      "This proposal does not change the order — confirm it instead of asking the customer to approve it",
    );
  }

  const removedItems: PartialFulfilmentRemovedItem[] = changedLines
    .filter((line) => line.toQuantity.isZero())
    .map((line) => ({
      itemId: line.item.id,
      productId: line.item.productId,
      variantId: line.item.variantId,
      name: line.item.productNameSnapshot,
      variantName: line.item.variantNameSnapshot,
      quantity: decimalToNumber(line.item.quantity),
      lineTotal: roundMoney(decimalToNumber(line.item.lineTotal)),
      reason: null,
    }));

  const reducedItems: PartialFulfilmentReducedItem[] = changedLines
    .filter((line) => line.toQuantity.greaterThan(0))
    .map((line) => ({
      itemId: line.item.id,
      productId: line.item.productId,
      variantId: line.item.variantId,
      name: line.item.productNameSnapshot,
      variantName: line.item.variantNameSnapshot,
      fromQuantity: decimalToNumber(line.item.quantity),
      toQuantity: decimalToNumber(line.toQuantity),
      lineTotal: roundMoney(decimalToNumber(line.lineTotal)),
    }));

  const totals = sumLines(keptLines);
  const proposedTotal = roundMoney(decimalToNumber(totals.total));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.PARTIAL_FULFILMENT_TIMEOUT_MINUTES * 60_000);

  const partialFulfilment: PartialFulfilmentInfo = {
    state: "AWAITING_CUSTOMER",
    proposedAt: now.toISOString(),
    respondedAt: null,
    expiresAt: expiresAt.toISOString(),
    note: input.note?.trim() || null,
    removedItems,
    reducedItems,
    originalTotal: roundMoney(decimalToNumber(order.total)),
    proposedTotal,
    proposedAmountPayable: computeProposedAmountPayable(parseOrderPayment(order.deliveryAddress), proposedTotal),
  };

  return { partialFulfilment, expiresAt, keptLines, totals };
}

/**
 * `POST /api/sales-orders/:id/propose-partial` — the shop's half of the flow.
 *
 * Deliberately writes NOTHING except the proposal itself: no stock movement, no SalesOrderItem
 * change, no status change. Everything is applied in one shot if (and only if) the customer
 * accepts — see `acceptPartialFulfilment`.
 */
export async function proposePartialFulfilment(
  organizationId: string,
  orderId: string,
  actorUserId: string,
  input: { items: PartialFulfilmentItemInput[]; note?: string | null },
) {
  const order = await getSalesOrderById(organizationId, orderId);

  if (!EDITABLE_ORDER_STATUSES.includes(order.status)) {
    throw ApiError.badRequest(
      order.status === SalesOrderStatus.CONFIRMED
        ? "This order is already confirmed — a partial fulfilment can only be proposed before you confirm it"
        : `This order can no longer be changed (it is ${order.status.toLowerCase().replace(/_/g, " ")})`,
    );
  }

  const existing = parsePartialFulfilment(order.deliveryAddress);

  if (existing?.state === "AWAITING_CUSTOMER") {
    throw ApiError.conflict("This order is already waiting for the customer to review a revised order");
  }

  const { partialFulfilment, expiresAt } = buildPartialFulfilmentProposal(order, input);

  // Atomic compare-and-swap on status, the same guard every other transition in this file uses:
  // a concurrent confirm/reject/cancel that lands between the checks above and this write must
  // win, not be silently overwritten by a proposal on an order that is no longer open.
  const { count } = await prisma.salesOrder.updateMany({
    where: { id: orderId, organizationId, status: { in: EDITABLE_ORDER_STATUSES } },
    data: {
      deliveryAddress: toNullableJsonValue(withPartialFulfilment(order.deliveryAddress, partialFulfilment)),
      // The order is now waiting on a HUMAN, not on the shop, so the shop-SLA deadline the
      // order-confirmation sweep enforces no longer applies — it is replaced by the proposal's
      // own expiry. The sweep reads `partialFulfilment.state` too and skips anything still
      // legitimately awaiting a customer, so both halves of the guard agree.
      confirmationDeadlineAt: expiresAt,
    },
  });

  if (count === 0) {
    throw ApiError.conflict("Order is no longer draft/pending — it may have been confirmed or rejected concurrently");
  }

  const updated = await getSalesOrderById(organizationId, orderId);

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.ORDER_PARTIAL_PROPOSE,
    entityType: "SalesOrder",
    entityId: updated.id,
    before: order,
    after: updated,
    meta: {
      removedItemCount: partialFulfilment.removedItems.length,
      reducedItemCount: partialFulfilment.reducedItems.length,
      originalTotal: partialFulfilment.originalTotal,
      proposedTotal: partialFulfilment.proposedTotal,
    },
  });

  if (updated.externalOrderId) {
    void notifyOrderEvent({
      externalOrderId: updated.externalOrderId,
      // Unchanged on purpose — the order really is still PENDING. NearCart maps that to
      // PENDING_CONFIRMATION, i.e. no local status move, and reacts to the eventType instead.
      status: updated.status,
      eventType: "PARTIAL_PROPOSED",
      partialFulfilment,
    });
  }

  return updated;
}

/**
 * Staff-facing alert for whatever the customer decided. Best-effort/never-throws, matching
 * `notifyStaffOfAutoAssignFailure`: the decision itself has already been committed by the time
 * this runs, so a push/log failure must not turn it into an error.
 */
async function notifyStaffOfPartialResponse(
  organizationId: string,
  order: { id: string; orderNumber: string },
  outcome: "ACCEPTED" | "DECLINED" | "EXPIRED",
): Promise<void> {
  try {
    const copy = {
      // NOT "confirmed", and stock has NOT moved: the customer's yes hands the order back to this
      // shop, which still has to confirm it. This push is the shop's cue to act, so it has to say
      // so — the old wording told staff the job was done and nothing needed doing.
      ACCEPTED: {
        title: "Customer accepted — confirm to start packing",
        body: `Order #${order.orderNumber}: the customer agreed to the items you can supply. Confirm the order to commit it and update stock.`,
      },
      DECLINED: {
        title: "Customer declined — order cancelled",
        body: `Order #${order.orderNumber} was cancelled because the customer did not want the revised order.`,
      },
      EXPIRED: {
        title: "Revised order expired — order cancelled",
        body: `Order #${order.orderNumber} was cancelled because the customer never responded to your revised order.`,
      },
    }[outcome];

    const data = { salesOrderId: order.id, outcome };

    void sendPushToOrgStaff(organizationId, {
      title: copy.title,
      body: copy.body,
      data,
      channelId: "order_alert",
    }).catch((error) => {
      console.warn(`[sales-orders] Failed to push partial-fulfilment ${outcome} alert for order ${order.id}`, error);
    });

    await recordNotificationLog(prisma, {
      organizationId,
      type: NotificationLogType.ORDER_PARTIAL_RESPONSE,
      title: copy.title,
      body: copy.body,
      data,
    });
  } catch (error) {
    console.warn(`[sales-orders] Failed to record partial-fulfilment ${outcome} notification for order ${order.id}`, error);
  }
}

/**
 * NearCart may re-derive the customer's final bill differently from us — most importantly it has
 * to drop a coupon whose minimum-spend no longer holds once items were removed, which pushes the
 * amount payable back UP. It sends the result here so the stored `payment` block (and therefore
 * what the driver is told to collect) matches what the customer actually agreed to. Optional:
 * without it we fall back to the proposal's own `proposedAmountPayable`.
 */
export interface RevisedPaymentInput {
  discountTotal?: number;
  loyaltyDiscount?: number;
  couponCode?: string | null;
  amountPayable?: number;
}

function buildAcceptedPaymentBlock(
  deliveryAddress: unknown,
  proposal: PartialFulfilmentInfo,
  revisedPayment?: RevisedPaymentInput | null,
): Record<string, unknown> | null {
  const address = parseDeliveryAddressObject(deliveryAddress);
  const existing = address?.payment;

  if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
    return null;
  }

  const next: Record<string, unknown> = { ...(existing as Record<string, unknown>) };

  next.itemTotal = proposal.proposedTotal;

  if (revisedPayment?.discountTotal != null) {
    next.discountTotal = revisedPayment.discountTotal;
  }

  if (revisedPayment?.loyaltyDiscount != null) {
    next.loyaltyDiscount = revisedPayment.loyaltyDiscount;
  }

  if (revisedPayment?.couponCode !== undefined) {
    if (revisedPayment.couponCode) {
      next.couponCode = revisedPayment.couponCode;
    } else {
      delete next.couponCode;
    }
  }

  next.amountPayable =
    revisedPayment?.amountPayable != null ? revisedPayment.amountPayable : (proposal.proposedAmountPayable ?? next.amountPayable);

  return next;
}

/**
 * Applies a revised order the customer has already approved: drops the removed lines, reduces the
 * reduced ones, recomputes the order's money (including the bill NearCart re-derived and sent with
 * the acceptance) and marks the proposal ACCEPTED.
 *
 * Deliberately takes the transaction client and no status handling of its own — it is called from
 * inside `confirmSalesOrder`'s transaction, AFTER that function's atomic status claim and BEFORE
 * it re-reads the order to deduct stock. That ordering is the whole point: the deduction then
 * happens against the revised quantities through the one shared `deductStockForSalesOrder` path,
 * so there is no second copy of the ledger logic and no way to deduct the original quantities.
 */
async function applyAcceptedPartialFulfilment(
  tx: Prisma.TransactionClient,
  orderId: string,
  proposal: PartialFulfilmentInfo,
): Promise<void> {
  const claimed = await tx.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });

  const removedIds = new Set(proposal.removedItems.map((entry) => entry.itemId));
  const reducedById = new Map(proposal.reducedItems.map((entry) => [entry.itemId, toDecimal(entry.toQuantity)]));

  const keptLines: RecomputedLine[] = [];

  for (const item of claimed.items) {
    if (removedIds.has(item.id)) {
      await tx.salesOrderItem.delete({ where: { id: item.id } });
      continue;
    }

    const toQuantity = reducedById.get(item.id);

    // An item the proposal never mentioned is unchanged; recomputing it at its own quantity is
    // a no-op that keeps the totals below derived from one single code path.
    const line = recomputeLine(item, toQuantity ?? toDecimal(item.quantity));
    keptLines.push(line);

    if (toQuantity) {
      await tx.salesOrderItem.update({
        where: { id: item.id },
        data: {
          quantity: line.toQuantity,
          discountAmount: line.discountAmount,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
        },
      });
    }
  }

  const totals = sumLines(keptLines);
  const settledProposal: PartialFulfilmentInfo = {
    ...proposal,
    state: "ACCEPTED",
  };

  let deliveryAddress = withPartialFulfilment(claimed.deliveryAddress, settledProposal);
  const acceptedPayment = buildAcceptedPaymentBlock(claimed.deliveryAddress, settledProposal, proposal.customerPayment);

  if (acceptedPayment) {
    deliveryAddress = withPaymentBlock(deliveryAddress, acceptedPayment);
  }

  await tx.salesOrder.update({
    where: { id: orderId },
    data: {
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
      deliveryAddress: toNullableJsonValue(deliveryAddress),
    },
  });
}

/**
 * The customer said yes — which parks the order for the SHOP, and commits nothing.
 *
 * This used to confirm the order and deduct stock outright. It no longer does, because the shop
 * has to get the last word: minutes can pass while the customer decides, and a walk-in can buy
 * the very stock the proposal promised in the meantime. So this records `CUSTOMER_ACCEPTED`,
 * leaves the order PENDING with its items untouched, and tells the shop it can now confirm.
 * `confirmSalesOrder` is what applies the revision and moves stock, so there is exactly one code
 * path where a revised order becomes real — and it is the shop's own Confirm action.
 *
 * `revisedPayment` is stashed on the proposal rather than applied, for the same reason: the bill
 * only becomes fact when the shop confirms.
 */
export async function acceptPartialFulfilment(
  organizationId: string,
  orderId: string,
  revisedPayment?: RevisedPaymentInput | null,
) {
  const order = await getSalesOrderById(organizationId, orderId);
  const proposal = parsePartialFulfilment(order.deliveryAddress);

  if (!proposal || proposal.state !== "AWAITING_CUSTOMER") {
    throw ApiError.conflict("This order is not waiting for a customer response");
  }

  const acceptedProposal: PartialFulfilmentInfo = {
    ...proposal,
    state: "CUSTOMER_ACCEPTED",
    respondedAt: new Date().toISOString(),
    customerPayment: revisedPayment ?? null,
  };

  // Same atomic compare-and-swap every other transition in this file uses: a concurrent
  // confirm/reject/cancel that lands first must win rather than be overwritten by a late yes.
  const { count } = await prisma.salesOrder.updateMany({
    where: { id: orderId, organizationId, status: { in: EDITABLE_ORDER_STATUSES } },
    data: {
      deliveryAddress: toNullableJsonValue(withPartialFulfilment(order.deliveryAddress, acceptedProposal)),
      // The clock is the shop's again, so the order-confirmation sweep's normal SLA applies from
      // here rather than the proposal's own (now spent) customer window.
      confirmationDeadlineAt: new Date(Date.now() + PARTIAL_SHOP_CONFIRM_WINDOW_MS),
    },
  });

  if (count === 0) {
    throw ApiError.conflict("Order is no longer draft/pending — it may have been confirmed or cancelled concurrently");
  }

  const accepted = await getSalesOrderById(organizationId, orderId);

  await createAuditLog(prisma, {
    organizationId,
    action: AuditAction.ORDER_PARTIAL_ACCEPT,
    entityType: "SalesOrder",
    entityId: orderId,
    before: order,
    after: accepted,
    meta: {
      source: "marketplace_bridge",
      note: "Customer accepted the revised order — awaiting the shop's confirmation",
    },
  });

  void notifyStaffOfPartialResponse(organizationId, accepted, "ACCEPTED");

  if (accepted.externalOrderId) {
    void notifyOrderEvent({
      externalOrderId: accepted.externalOrderId,
      status: accepted.status,
      eventType: "PARTIAL_ACCEPTED",
      partialFulfilment: parsePartialFulfilment(accepted.deliveryAddress),
    });
  }

  return accepted;
}

/**
 * The customer said no, or never answered. Shared by the bridge's decline path and the sweep's
 * expiry path — the only differences are the recorded state, the reason and who gets told.
 *
 * Routes through the existing `cancelSalesOrder` rather than duplicating its logic. Nothing was
 * ever deducted for a PENDING order, so that path correctly performs no stock reversal; it also
 * fires no webhook of its own for a null actor (it assumes NearCart already knows), which is why
 * the explicit `notifyOrderEvent` below is not optional — the expiry case in particular is
 * something only this backend can know about.
 */
async function closePartialFulfilment(
  organizationId: string,
  orderId: string,
  outcome: "DECLINED" | "EXPIRED",
) {
  const order = await getSalesOrderById(organizationId, orderId);
  const proposal = parsePartialFulfilment(order.deliveryAddress);

  if (!proposal || proposal.state !== "AWAITING_CUSTOMER") {
    throw ApiError.conflict("This order is not waiting for a customer response");
  }

  const reason = outcome === "DECLINED" ? PARTIAL_DECLINE_REASON : PARTIAL_EXPIRY_REASON;
  const closedProposal: PartialFulfilmentInfo = {
    ...proposal,
    state: outcome,
    respondedAt: new Date().toISOString(),
  };

  const { count } = await prisma.salesOrder.updateMany({
    where: { id: orderId, organizationId, status: { in: EDITABLE_ORDER_STATUSES } },
    data: {
      deliveryAddress: toNullableJsonValue(withPartialFulfilment(order.deliveryAddress, closedProposal)),
      // `cancelSalesOrder` has no reason parameter (unlike reject) — recording it here, on the
      // same row, is what makes a cancelled order self-explaining in the Partner app.
      rejectionReason: reason,
    },
  });

  if (count === 0) {
    throw ApiError.conflict("Order is no longer draft/pending — it may have been confirmed or cancelled concurrently");
  }

  const cancelled = await cancelSalesOrder(organizationId, orderId, null);

  await createAuditLog(prisma, {
    organizationId,
    action: outcome === "DECLINED" ? AuditAction.ORDER_PARTIAL_DECLINE : AuditAction.ORDER_PARTIAL_EXPIRE,
    entityType: "SalesOrder",
    entityId: orderId,
    meta: { source: "marketplace_bridge", reason },
  });

  void notifyStaffOfPartialResponse(organizationId, cancelled, outcome);

  if (cancelled.externalOrderId) {
    void notifyOrderEvent({
      externalOrderId: cancelled.externalOrderId,
      status: cancelled.status,
      eventType: outcome === "DECLINED" ? "PARTIAL_DECLINED" : "PARTIAL_EXPIRED",
      partialFulfilment: closedProposal,
    });
  }

  return cancelled;
}

/** The customer refused the revised order — cancel it. */
export async function declinePartialFulfilment(organizationId: string, orderId: string) {
  return closePartialFulfilment(organizationId, orderId, "DECLINED");
}

/**
 * The customer never answered within `PARTIAL_FULFILMENT_TIMEOUT_MINUTES` — cancel it. Called
 * only from the order-confirmation sweep (jobs/order-confirmation-sweep.ts); a proposal must not
 * be able to hang an order forever.
 */
export async function expirePartialFulfilment(organizationId: string, orderId: string) {
  return closePartialFulfilment(organizationId, orderId, "EXPIRED");
}
