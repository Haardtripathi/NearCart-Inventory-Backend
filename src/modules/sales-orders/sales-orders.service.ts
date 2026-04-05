import {
  AuditAction,
  OrderSource,
  PaymentStatus,
  ReferenceType,
  SalesOrderStatus,
  StockMovementType,
} from "@prisma/client";

import { prisma } from "../../config/prisma";
import { toDecimal } from "../../utils/decimal";
import { ApiError } from "../../utils/ApiError";
import { syncEntityFieldTranslations } from "../../utils/entityFieldTranslations";
import { assertBranchInOrg, assertCustomerInOrg, assertVariantInOrg } from "../../utils/guards";
import { toNullableJsonValue } from "../../utils/json";
import { generateDocumentNumber } from "../../utils/numbering";
import { buildPagination, getPagination } from "../../utils/pagination";
import { createAuditLog } from "../audit/audit.service";
import { applyStockMovement } from "../inventory/inventory.service";

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

    const updated = await tx.salesOrder.update({
      where: { id: orderId },
      data: {
        status: SalesOrderStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedById: actorUserId,
      },
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

  return confirmed;
}

export async function rejectSalesOrder(
  organizationId: string,
  orderId: string,
  actorUserId: string,
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

  return updated;
}

export async function cancelSalesOrder(organizationId: string, orderId: string, actorUserId: string) {
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
          createdById: actorUserId,
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
      action: AuditAction.UPDATE,
      entityType: "SalesOrder",
      entityId: order.id,
      before: order,
      after: updated,
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

  return updated;
}
