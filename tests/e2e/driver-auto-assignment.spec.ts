import { describe, expect, it } from "vitest";

import { prisma } from "../../src/config/prisma";
import { env } from "../../src/config/env";
import { getSuperAdminToken } from "../helpers/auth";
import {
  confirmSalesOrder,
  createOrgWithGeoBranch,
  createSalesOrder,
  createTestVariant,
  markSalesOrderReady,
  setDeliveryAddressCoords,
} from "../helpers/catalog";
import { setupVerifiedDriver } from "../helpers/driver";
import { offsetCoords } from "../helpers/geo";

// Bangalore — dedicated to this file. Every geo-matching spec file in this suite uses a distinct,
// well-separated (>100km apart) real-world city as its origin specifically so leftover
// VERIFIED+available drivers or unassigned READY orders from one spec file can never be
// accidentally matched by a later/different spec file sharing the same on-disk test.db (see
// vitest.config.ts's fileParallelism:false comment) — DRIVER_MATCH_RADIUS_KM defaults to 15km,
// so >100km of separation is a very comfortable margin.
const BRANCH_ORIGIN = { lat: 12.9716, lng: 77.5946 };

describe("driver auto-assignment on mark-ready", () => {
  it("assigns the nearest free driver within DRIVER_MATCH_RADIUS_KM when marking an order ready", async () => {
    const token = await getSuperAdminToken();
    const { organizationId, branchId } = await createOrgWithGeoBranch(token, {
      latitude: BRANCH_ORIGIN.lat,
      longitude: BRANCH_ORIGIN.lng,
    });
    const { productId, variantId } = await createTestVariant(token, organizationId);

    const orderId = await createSalesOrder(token, organizationId, branchId, { productId, variantId });
    await confirmSalesOrder(token, organizationId, orderId);

    const deliveryCoords = offsetCoords(BRANCH_ORIGIN, { north: 3, east: 0 });
    await setDeliveryAddressCoords(orderId, { latitude: deliveryCoords.lat, longitude: deliveryCoords.lng });

    const driverCoords = offsetCoords(BRANCH_ORIGIN, { north: 1, east: 0 });
    const { driverId } = await setupVerifiedDriver(token, {
      latitude: driverCoords.lat,
      longitude: driverCoords.lng,
    });

    const ready = await markSalesOrderReady(token, organizationId, orderId);

    expect(ready.status).toBe("READY");
    expect(ready.assignedDriverId).toBe(driverId);
  });

  it("leaves the order unassigned and logs a NO_DRIVER_AVAILABLE audit entry when the only driver is beyond the match radius", async () => {
    const token = await getSuperAdminToken();
    const { organizationId, branchId } = await createOrgWithGeoBranch(token, {
      latitude: BRANCH_ORIGIN.lat,
      longitude: BRANCH_ORIGIN.lng,
    });
    const { productId, variantId } = await createTestVariant(token, organizationId);

    const orderId = await createSalesOrder(token, organizationId, branchId, { productId, variantId });
    await confirmSalesOrder(token, organizationId, orderId);

    const deliveryCoords = offsetCoords(BRANCH_ORIGIN, { north: 3, east: 0 });
    await setDeliveryAddressCoords(orderId, { latitude: deliveryCoords.lat, longitude: deliveryCoords.lng });

    // 10km past the configured radius, so this holds regardless of DRIVER_MATCH_RADIUS_KM's
    // actual value rather than assuming the 15km default.
    const farDriverCoords = offsetCoords(BRANCH_ORIGIN, { north: env.DRIVER_MATCH_RADIUS_KM + 10, east: 0 });
    await setupVerifiedDriver(token, { latitude: farDriverCoords.lat, longitude: farDriverCoords.lng });

    const ready = await markSalesOrderReady(token, organizationId, orderId);

    expect(ready.status).toBe("READY");
    expect(ready.assignedDriverId).toBeNull();

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        entityType: "SalesOrder",
        entityId: orderId,
        action: "ORDER_AUTOASSIGN_FAILED",
      },
      orderBy: { createdAt: "desc" },
    });

    expect(auditEntry).not.toBeNull();
    expect((auditEntry?.meta as { reason?: string } | null)?.reason).toBe("NO_DRIVER_AVAILABLE");
  });
});
