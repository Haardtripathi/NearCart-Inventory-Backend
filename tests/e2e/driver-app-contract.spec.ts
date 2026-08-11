import { describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app";
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

// Hyderabad — dedicated to this file (see driver-auto-assignment.spec.ts's BRANCH_ORIGIN comment).
const BRANCH_ORIGIN = { lat: 17.3850, lng: 78.4867 };

/**
 * Contract test: this backend has no automated coverage of its own on the `NearCart-Driver`
 * mobile app side, so the only thing standing between a backend refactor and a silently broken
 * driver app is a test on THIS side asserting the exact response shape that app is built against.
 * Field presence/type, not full business-logic correctness (covered by the other spec files) is
 * the point here.
 */
describe("driver app response contract", () => {
  it("register -> verify -> login -> location -> availability -> auto-assign -> GET /driver/orders exposes total/estimatedDistanceKm/driverDeliveryFee with correct types", async () => {
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

    const driverCoords = offsetCoords(BRANCH_ORIGIN, { north: 1, east: 0 });
    const driver = await setupVerifiedDriver(token, { latitude: driverCoords.lat, longitude: driverCoords.lng });

    const ready = await markSalesOrderReady(token, organizationId, orderId);
    expect(ready.assignedDriverId).toBe(driver.driverId);

    const ordersResponse = await request(app)
      .get("/api/driver/orders")
      .set("Authorization", `Bearer ${driver.token}`);

    expect(ordersResponse.status).toBe(200);
    expect(ordersResponse.body).toHaveProperty("success", true);
    const orders = ordersResponse.body.data as Array<Record<string, unknown>>;
    expect(Array.isArray(orders)).toBe(true);

    const order = orders.find((o) => o.id === orderId);
    expect(order).toBeDefined();
    expect(order).toHaveProperty("total");
    expect(order!.total).not.toBeUndefined();
    expect(order!.estimatedDistanceKm === null || typeof order!.estimatedDistanceKm === "number").toBe(true);
    expect(order!.estimatedDistanceKm).not.toBeNull();
    expect(order!.driverDeliveryFee === null || typeof order!.driverDeliveryFee === "number").toBe(true);
    expect(order!.driverDeliveryFee).not.toBeNull();

    // Deliver it so the earnings-summary contract below has a real row to report on.
    await request(app).post(`/api/driver/orders/${orderId}/pickup`).set("Authorization", `Bearer ${driver.token}`).expect(200);
    await request(app).post(`/api/driver/orders/${orderId}/deliver`).set("Authorization", `Bearer ${driver.token}`).expect(200);

    const earningsResponse = await request(app)
      .get("/api/driver/earnings/summary?range=all")
      .set("Authorization", `Bearer ${driver.token}`);

    expect(earningsResponse.status).toBe(200);
    const summary = earningsResponse.body.data as Record<string, unknown>;

    // `averageFeePerDelivery` is the current field name — `feePerDelivery` was removed and must
    // not silently reappear (a driver-app client built against the old name would otherwise
    // start rendering `undefined` with zero signal from this backend).
    expect(summary).toHaveProperty("averageFeePerDelivery");
    expect(typeof summary.averageFeePerDelivery).toBe("number");
    expect(summary).not.toHaveProperty("feePerDelivery");

    expect(typeof summary.totalEarnings).toBe("number");
    expect(summary).toHaveProperty("lifetime");
    expect(typeof (summary.lifetime as Record<string, unknown>).totalEarnings).toBe("number");

    expect(Array.isArray(summary.recentDeliveries)).toBe(true);
    const recentDeliveries = summary.recentDeliveries as Array<Record<string, unknown>>;
    const delivered = recentDeliveries.find((d) => d.id === orderId);
    expect(delivered).toBeDefined();
    expect(typeof delivered!.earning).toBe("number");
  });
});
