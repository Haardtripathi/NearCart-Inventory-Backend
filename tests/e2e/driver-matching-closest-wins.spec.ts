import { describe, expect, it } from "vitest";

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
import { env } from "../../src/config/env";

// Delhi — dedicated to this file (see driver-auto-assignment.spec.ts's BRANCH_ORIGIN comment for
// why every geo-matching spec file gets its own real-world city, >100km from every other one).
const BRANCH_ORIGIN = { lat: 28.6139, lng: 77.2090 };

describe("driver matching picks the closest eligible driver, not just any eligible driver", () => {
  it("assigns the nearest of three in-radius drivers, not the second- or third-nearest", async () => {
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

    // Three offsets scaled off the configured radius (defaults to 15km -> ~2.25/7.5/12.75km) so
    // all three stay comfortably inside DRIVER_MATCH_RADIUS_KM even if it's reconfigured, while
    // remaining clearly ordered near < mid < far.
    const radius = env.DRIVER_MATCH_RADIUS_KM;
    const nearCoords = offsetCoords(BRANCH_ORIGIN, { north: 0, east: radius * 0.15 });
    const midCoords = offsetCoords(BRANCH_ORIGIN, { north: 0, east: radius * 0.5 });
    const farCoords = offsetCoords(BRANCH_ORIGIN, { north: 0, east: radius * 0.85 });

    // Registered out of distance order on purpose (mid, far, near) so a passing test can't be
    // explained away by "it just picked whichever was created/available first".
    const midDriver = await setupVerifiedDriver(token, { latitude: midCoords.lat, longitude: midCoords.lng });
    const farDriver = await setupVerifiedDriver(token, { latitude: farCoords.lat, longitude: farCoords.lng });
    const nearDriver = await setupVerifiedDriver(token, { latitude: nearCoords.lat, longitude: nearCoords.lng });

    const ready = await markSalesOrderReady(token, organizationId, orderId);

    expect(ready.status).toBe("READY");
    expect(ready.assignedDriverId).toBe(nearDriver.driverId);
    expect(ready.assignedDriverId).not.toBe(midDriver.driverId);
    expect(ready.assignedDriverId).not.toBe(farDriver.driverId);
  });
});
