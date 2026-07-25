import { AuditAction, SalesOrderStatus } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { createAuditLog } from "../audit/audit.service";

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

export async function pickupDriverOrder(driverId: string, orderId: string) {
  const order = await findAssignedOrder(driverId, orderId);

  if (order.status !== SalesOrderStatus.READY) {
    throw ApiError.badRequest("Only orders that are READY can be picked up");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Guard against two concurrent pickup calls for the same order (e.g. a flaky mobile client
    // retrying the request): the WHERE clause's status + assignedDriverId checks are evaluated
    // atomically by Postgres as part of the UPDATE, so only the first caller can win.
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

  return serializeDriverOrder(updated);
}

export async function deliverDriverOrder(driverId: string, orderId: string) {
  const order = await findAssignedOrder(driverId, orderId);

  if (order.status !== SalesOrderStatus.OUT_FOR_DELIVERY) {
    throw ApiError.badRequest("Only orders that are OUT_FOR_DELIVERY can be marked delivered");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Guard against two concurrent deliver calls for the same order — see pickupDriverOrder
    // above for the same pattern/rationale.
    const { count } = await tx.salesOrder.updateMany({
      where: { id: orderId, assignedDriverId: driverId, status: SalesOrderStatus.OUT_FOR_DELIVERY },
      data: {
        status: SalesOrderStatus.DELIVERED,
        deliveredAt: new Date(),
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

  return serializeDriverOrder(updated);
}
