import { describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { getSuperAdminToken } from "../helpers/auth";
import {
  confirmSalesOrder,
  createOrgWithGeoBranch,
  createSalesOrder,
  createTestVariant,
  markSalesOrderReady,
  setDeliveryAddressCoords,
} from "../helpers/catalog";
import { setDriverAvailability, setupVerifiedDriver } from "../helpers/driver";
import { offsetCoords } from "../helpers/geo";

// Mumbai — dedicated to this file (see driver-auto-assignment.spec.ts's BRANCH_ORIGIN comment).
const BRANCH_ORIGIN = { lat: 19.0760, lng: 72.8777 };

async function getOrderAssignedDriverId(orderId: string): Promise<string | null> {
  const order = await prisma.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { assignedDriverId: true },
  });
  return order.assignedDriverId;
}

async function getOrderDeclinedByDriverIds(orderId: string): Promise<unknown> {
  const order = await prisma.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { declinedByDriverIds: true },
  });
  return order.declinedByDriverIds;
}

describe("driver decline -> reassignment, and the never-re-offered-to-a-past-decliner guarantee", () => {
  it("reassigns to the next-nearest driver on decline, then to null once every in-radius driver has declined", async () => {
    const token = await getSuperAdminToken();
    const { organizationId, branchId } = await createOrgWithGeoBranch(token, {
      latitude: BRANCH_ORIGIN.lat,
      longitude: BRANCH_ORIGIN.lng,
    });
    const { productId, variantId } = await createTestVariant(token, organizationId);

    const orderId = await createSalesOrder(token, organizationId, branchId, { productId, variantId });
    await confirmSalesOrder(token, organizationId, orderId);

    const deliveryCoords = offsetCoords(BRANCH_ORIGIN, { north: 2, east: 0 });
    await setDeliveryAddressCoords(orderId, { latitude: deliveryCoords.lat, longitude: deliveryCoords.lng });

    const closerCoords = offsetCoords(BRANCH_ORIGIN, { north: 1, east: 0 });
    const fartherCoords = offsetCoords(BRANCH_ORIGIN, { north: 5, east: 0 });

    const driverA = await setupVerifiedDriver(token, { latitude: closerCoords.lat, longitude: closerCoords.lng });
    const driverB = await setupVerifiedDriver(token, { latitude: fartherCoords.lat, longitude: fartherCoords.lng });

    const ready = await markSalesOrderReady(token, organizationId, orderId);
    expect(ready.assignedDriverId).toBe(driverA.driverId);

    // Driver A declines -> B (the only other in-radius driver) should now be assigned.
    const declineAResponse = await request(app)
      .post(`/api/driver/orders/${orderId}/decline`)
      .set("Authorization", `Bearer ${driverA.token}`);

    expect(declineAResponse.status).toBe(200);
    // serializeDriverOrder (driver-orders.service.ts) deliberately doesn't expose
    // `assignedDriverId` in the driver-facing response body, so the reassignment is verified
    // directly against the DB (same as the task brief's own suggested pattern for
    // declinedByDriverIds below), plus a behavioral check that B's own order list now includes it.
    expect(await getOrderAssignedDriverId(orderId)).toBe(driverB.driverId);

    const driverBOrdersAfterReassign = await request(app)
      .get("/api/driver/orders")
      .set("Authorization", `Bearer ${driverB.token}`);
    expect(driverBOrdersAfterReassign.status).toBe(200);
    expect((driverBOrdersAfterReassign.body.data as Array<{ id: string }>).map((o) => o.id)).toContain(orderId);

    // Driver B declines too -> no other in-radius driver left, order goes back to unassigned.
    const declineBResponse = await request(app)
      .post(`/api/driver/orders/${orderId}/decline`)
      .set("Authorization", `Bearer ${driverB.token}`);

    expect(declineBResponse.status).toBe(200);
    expect(await getOrderAssignedDriverId(orderId)).toBeNull();

    const declinedByDriverIds = await getOrderDeclinedByDriverIds(orderId);
    expect(declinedByDriverIds).toEqual(expect.arrayContaining([driverA.driverId, driverB.driverId]));

    // Driver A toggling back online (false -> true, matching updateDriverAvailability's own
    // reverse-matcher trigger condition) must NOT re-offer this exact order to A, since A is in
    // its declinedByDriverIds history — this is the actual end-to-end guarantee, not just that the
    // field gets written (which the assertion above already covers).
    await setDriverAvailability(driverA.token, false);
    await setDriverAvailability(driverA.token, true);

    expect(await getOrderAssignedDriverId(orderId)).toBeNull();

    const driverAOrdersAfterComingBackOnline = await request(app)
      .get("/api/driver/orders")
      .set("Authorization", `Bearer ${driverA.token}`);
    expect(driverAOrdersAfterComingBackOnline.status).toBe(200);
    expect((driverAOrdersAfterComingBackOnline.body.data as Array<{ id: string }>).map((o) => o.id)).not.toContain(orderId);
  });
});
