import { AuditAction, SalesOrderStatus } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { createAuditLog } from "../audit/audit.service";

/**
 * Lists orders assigned to the current driver that still need action — READY (needs pickup) or
 * OUT_FOR_DELIVERY (needs final delivery confirmation).
 */
export async function listDriverOrders(organizationId: string, driverId: string) {
  return prisma.salesOrder.findMany({
    where: {
      organizationId,
      assignedDriverId: driverId,
      status: {
        in: [SalesOrderStatus.READY, SalesOrderStatus.OUT_FOR_DELIVERY],
      },
    },
    include: {
      branch: true,
      customer: true,
      items: true,
    },
    orderBy: {
      assignedAt: "asc",
    },
  });
}

async function getOrderAssignedToDriver(organizationId: string, orderId: string, driverId: string) {
  const order = await prisma.salesOrder.findFirst({
    where: {
      id: orderId,
      organizationId,
    },
    include: {
      items: true,
      branch: true,
      customer: true,
    },
  });

  if (!order) {
    throw ApiError.notFound("Sales order not found");
  }

  if (order.assignedDriverId !== driverId) {
    throw ApiError.forbidden("This order is not assigned to you");
  }

  return order;
}

export async function pickupDriverOrder(organizationId: string, orderId: string, driverId: string) {
  const order = await getOrderAssignedToDriver(organizationId, orderId, driverId);

  if (order.status !== SalesOrderStatus.READY) {
    throw ApiError.badRequest("Only orders that are ready for pickup can be picked up");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.salesOrder.update({
      where: { id: orderId },
      data: {
        status: SalesOrderStatus.OUT_FOR_DELIVERY,
        pickedUpAt: new Date(),
      },
      include: {
        items: true,
        branch: true,
        customer: true,
      },
    });

    await createAuditLog(tx, {
      organizationId,
      actorUserId: driverId,
      action: AuditAction.ORDER_PICKUP,
      entityType: "SalesOrder",
      entityId: order.id,
      before: order,
      after: result,
    });

    return result;
  });

  return updated;
}

export async function deliverDriverOrder(organizationId: string, orderId: string, driverId: string) {
  const order = await getOrderAssignedToDriver(organizationId, orderId, driverId);

  if (order.status !== SalesOrderStatus.OUT_FOR_DELIVERY) {
    throw ApiError.badRequest("Only orders that are out for delivery can be marked delivered");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.salesOrder.update({
      where: { id: orderId },
      data: {
        status: SalesOrderStatus.DELIVERED,
        deliveredAt: new Date(),
        // Reusing deliveredById/ORDER_DELIVER here (the same field + audit action the
        // MANAGER_ROLES /sales-orders/:id/deliver route uses) — a driver-completed delivery is
        // the same lifecycle event, just triggered by the assigned driver instead of shop staff.
        deliveredById: driverId,
      },
      include: {
        items: true,
        branch: true,
        customer: true,
      },
    });

    await createAuditLog(tx, {
      organizationId,
      actorUserId: driverId,
      action: AuditAction.ORDER_DELIVER,
      entityType: "SalesOrder",
      entityId: order.id,
      before: order,
      after: result,
    });

    return result;
  });

  return updated;
}
