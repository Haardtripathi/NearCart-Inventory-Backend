import { describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app";
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
import { expectedDriverFare, haversineKm, offsetCoords } from "../helpers/geo";

// Chennai — dedicated to this file (see driver-auto-assignment.spec.ts's BRANCH_ORIGIN comment).
const BRANCH_ORIGIN = { lat: 13.0827, lng: 80.2707 };

const FARE_RATES = {
  base: env.DRIVER_FARE_BASE,
  perKm: env.DRIVER_FARE_PER_KM,
  min: env.DRIVER_FARE_MIN,
  max: env.DRIVER_FARE_MAX,
};

describe("distance-based driver fare", () => {
  it("computes a near-order fee strictly less than a far-order fee, matching an independent haversine+clamp calculation, and sums correctly into driver earnings", async () => {
    const token = await getSuperAdminToken();
    const { organizationId, branchId } = await createOrgWithGeoBranch(token, {
      latitude: BRANCH_ORIGIN.lat,
      longitude: BRANCH_ORIGIN.lng,
    });
    const { productId, variantId } = await createTestVariant(token, organizationId);

    // A single driver very close to the branch, reused for both deliveries in sequence (see
    // below) so that this test's earnings-summary assertion is a clean "sum of two real fees",
    // not muddied by having to add up across two different drivers' summaries.
    const driverCoords = offsetCoords(BRANCH_ORIGIN, { north: 0.2, east: 0 });
    const driver = await setupVerifiedDriver(token, { latitude: driverCoords.lat, longitude: driverCoords.lng });

    // --- Order A: ~1km delivery ---
    const orderAId = await createSalesOrder(token, organizationId, branchId, { productId, variantId });
    await confirmSalesOrder(token, organizationId, orderAId);
    const deliveryACoords = offsetCoords(BRANCH_ORIGIN, { north: 0, east: 1 });
    await setDeliveryAddressCoords(orderAId, { latitude: deliveryACoords.lat, longitude: deliveryACoords.lng });

    const readyA = await markSalesOrderReady(token, organizationId, orderAId);
    expect(readyA.assignedDriverId).toBe(driver.driverId);

    const expectedDistanceA = haversineKm(BRANCH_ORIGIN, deliveryACoords);
    const expectedFareA = expectedDriverFare(expectedDistanceA, FARE_RATES);

    expect(readyA.estimatedDistanceKm).toBeCloseTo(expectedDistanceA, 4);
    expect(Number(readyA.driverDeliveryFee)).toBeCloseTo(expectedFareA, 2);

    // Free the driver back up by completing order A's delivery before order B is even created —
    // this is what lets order B auto-assign to the SAME driver below.
    await request(app).post(`/api/driver/orders/${orderAId}/pickup`).set("Authorization", `Bearer ${driver.token}`).expect(200);
    await request(app).post(`/api/driver/orders/${orderAId}/deliver`).set("Authorization", `Bearer ${driver.token}`).expect(200);

    // --- Order B: ~10km delivery ---
    const orderBId = await createSalesOrder(token, organizationId, branchId, { productId, variantId });
    await confirmSalesOrder(token, organizationId, orderBId);
    const deliveryBCoords = offsetCoords(BRANCH_ORIGIN, { north: 0, east: 10 });
    await setDeliveryAddressCoords(orderBId, { latitude: deliveryBCoords.lat, longitude: deliveryBCoords.lng });

    const readyB = await markSalesOrderReady(token, organizationId, orderBId);
    expect(readyB.assignedDriverId).toBe(driver.driverId);

    const expectedDistanceB = haversineKm(BRANCH_ORIGIN, deliveryBCoords);
    const expectedFareB = expectedDriverFare(expectedDistanceB, FARE_RATES);

    expect(readyB.estimatedDistanceKm).toBeCloseTo(expectedDistanceB, 4);
    expect(Number(readyB.driverDeliveryFee)).toBeCloseTo(expectedFareB, 2);

    // The near order must be strictly cheaper than the far one.
    expect(Number(readyA.driverDeliveryFee)).toBeLessThan(Number(readyB.driverDeliveryFee));

    await request(app).post(`/api/driver/orders/${orderBId}/pickup`).set("Authorization", `Bearer ${driver.token}`).expect(200);
    await request(app).post(`/api/driver/orders/${orderBId}/deliver`).set("Authorization", `Bearer ${driver.token}`).expect(200);

    const earningsResponse = await request(app)
      .get("/api/driver/earnings/summary?range=all")
      .set("Authorization", `Bearer ${driver.token}`);

    expect(earningsResponse.status).toBe(200);
    const summary = earningsResponse.body.data;

    const expectedTotal = expectedFareA + expectedFareB;
    expect(summary.totalEarnings).toBeCloseTo(expectedTotal, 2);
    expect(summary.lifetime.totalEarnings).toBeCloseTo(expectedTotal, 2);
    expect(summary.averageFeePerDelivery).toBeCloseTo(expectedTotal / 2, 2);

    // Explicitly not the old flat-rate approximation (`DRIVER_DELIVERY_FEE * 2`) — the whole point
    // of this feature is real per-order fares, not a flat rate. Only meaningful when the two real
    // fares actually differ from the flat rate, which they do here (env.test's fare rates are
    // base=20/perKm=8, flat DRIVER_DELIVERY_FEE=30 — ~1km and ~10km deliveries land at different
    // numbers from both 30 and each other).
    expect(summary.totalEarnings).not.toBeCloseTo(env.DRIVER_DELIVERY_FEE * 2, 2);

    const deliveredIds = (summary.recentDeliveries as Array<{ id: string; earning: number }>).map((d) => d.id);
    expect(deliveredIds).toEqual(expect.arrayContaining([orderAId, orderBId]));

    const recentA = (summary.recentDeliveries as Array<{ id: string; earning: number }>).find((d) => d.id === orderAId);
    const recentB = (summary.recentDeliveries as Array<{ id: string; earning: number }>).find((d) => d.id === orderBId);
    expect(recentA?.earning).toBeCloseTo(expectedFareA, 2);
    expect(recentB?.earning).toBeCloseTo(expectedFareB, 2);
  });
});
