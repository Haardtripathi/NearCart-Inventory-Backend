import { describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { getSuperAdminToken } from "../helpers/auth";
import { confirmSalesOrder, createOrgWithGeoBranch, createTestVariant, markSalesOrderReady } from "../helpers/catalog";
import { setupVerifiedDriver } from "../helpers/driver";
import { offsetCoords } from "../helpers/geo";
import { uniqueSuffix } from "../helpers/ids";

// Jaipur — dedicated to this file (see driver-auto-assignment.spec.ts's BRANCH_ORIGIN comment).
const BRANCH_ORIGIN = { lat: 26.9124, lng: 75.7873 };

const INTERNAL_TOKEN = process.env.MARKETPLACE_INTERNAL_TOKEN!;

/**
 * Regression test for the "driver told to collect the goods total, not what the customer owes"
 * money bug: NearCart's checkout push now carries a `payment` block, which must (a) be stored
 * under `deliveryAddress.payment` WITHOUT touching `total` (goods value) or the address keys,
 * (b) come back out of both the driver serializer and the Partner-app sales-order list/detail as
 * explicit `payment` + `amountToCollect` fields.
 */
async function pushBridgedOrder(
  organizationId: string,
  branchId: string,
  productId: string,
  payment: Record<string, unknown> | undefined,
  coords: { lat: number; lng: number },
) {
  const externalOrderId = `nc-order-${uniqueSuffix()}`;
  const response = await request(app)
    .post(`/api/internal/marketplace/organizations/${organizationId}/sales-orders`)
    .set("x-internal-service-token", INTERNAL_TOKEN)
    .send({
      branchId,
      externalOrderId,
      externalOrderNumber: `NC-${externalOrderId}`,
      customer: {
        name: "Payment Test Customer",
        phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
        addressLine: "12 Payment Test Street",
        latitude: coords.lat,
        longitude: coords.lng,
      },
      // createTestVariant prices the variant at 25; the bridge reprices server-side anyway.
      items: [{ inventoryProductId: productId, inventoryVariantId: null, quantity: 2, unitPrice: 25 }],
      notes: null,
      ...(payment ? { payment } : {}),
    });

  expect([200, 201]).toContain(response.status);
  return response.body.data.salesOrderId as string;
}

describe("marketplace bridge: NearCart payment block -> amountToCollect", () => {
  it("COD order: driver + Partner serializers expose amountToCollect = amountPayable (124), total stays goods value (50)", async () => {
    const token = await getSuperAdminToken();
    const { organizationId, branchId } = await createOrgWithGeoBranch(token, {
      latitude: BRANCH_ORIGIN.lat,
      longitude: BRANCH_ORIGIN.lng,
    });
    const { productId } = await createTestVariant(token, organizationId);
    const deliveryCoords = offsetCoords(BRANCH_ORIGIN, { north: 2, east: 0 });

    const payment = {
      method: "COD",
      status: "PENDING",
      itemTotal: 50,
      deliveryFee: 74,
      discountTotal: 0,
      amountPayable: 124,
      currency: "INR",
    };
    const orderId = await pushBridgedOrder(organizationId, branchId, productId, payment, deliveryCoords);

    const stored = await prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(Number(stored.total)).toBe(50);
    expect(Number(stored.subtotal)).toBe(50);
    expect(stored.paymentStatus).toBe("UNPAID");
    const storedAddress = (
      typeof stored.deliveryAddress === "string" ? JSON.parse(stored.deliveryAddress) : stored.deliveryAddress
    ) as Record<string, unknown>;
    expect(storedAddress).toMatchObject({
      addressLine: "12 Payment Test Street",
      latitude: deliveryCoords.lat,
      longitude: deliveryCoords.lng,
      payment,
    });

    // Partner app: detail + list.
    const detail = await request(app)
      .get(`/api/sales-orders/${orderId}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-organization-id", organizationId);
    expect(detail.status).toBe(200);
    expect(detail.body.data.amountToCollect).toBe(124);
    expect(detail.body.data.payment).toMatchObject({ method: "COD", deliveryFee: 74, amountPayable: 124 });
    expect(Number(detail.body.data.total)).toBe(50);

    const list = await request(app)
      .get("/api/sales-orders")
      .set("Authorization", `Bearer ${token}`)
      .set("x-organization-id", organizationId);
    expect(list.status).toBe(200);
    const row = (list.body.data.items as Array<Record<string, unknown>>).find((entry) => entry.id === orderId);
    expect(row).toBeDefined();
    expect(row!.amountToCollect).toBe(124);
    expect(row!.payment).toMatchObject({ method: "COD", amountPayable: 124 });

    // Lifecycle actions echo the same fields (the Partner app swaps its cached detail for these).
    const confirmed = await confirmSalesOrder(token, organizationId, orderId);
    expect(confirmed.amountToCollect).toBe(124);

    // Driver app. The distance-based fare must still work off the same Json column.
    const driverCoords = offsetCoords(BRANCH_ORIGIN, { north: 1, east: 0 });
    const driver = await setupVerifiedDriver(token, { latitude: driverCoords.lat, longitude: driverCoords.lng });
    const ready = await markSalesOrderReady(token, organizationId, orderId);
    expect(ready.assignedDriverId).toBe(driver.driverId);
    expect(ready.estimatedDistanceKm).not.toBeNull();

    const driverOrders = await request(app).get("/api/driver/orders").set("Authorization", `Bearer ${driver.token}`);
    expect(driverOrders.status).toBe(200);
    const driverOrder = (driverOrders.body.data as Array<Record<string, unknown>>).find((entry) => entry.id === orderId);
    expect(driverOrder).toBeDefined();
    expect(driverOrder!.amountToCollect).toBe(124);
    expect(driverOrder!.payment).toMatchObject({ method: "COD", status: "PENDING", deliveryFee: 74, amountPayable: 124 });
    expect(Number(driverOrder!.total)).toBe(50);
    expect(driverOrder!.driverDeliveryFee).not.toBeNull();
  });

  it("ONLINE + PAID is created PAID with nothing to collect; ONLINE + PENDING stays UNPAID and collectable", async () => {
    const token = await getSuperAdminToken();
    const { organizationId, branchId } = await createOrgWithGeoBranch(token, {
      latitude: BRANCH_ORIGIN.lat,
      longitude: BRANCH_ORIGIN.lng,
    });
    const { productId } = await createTestVariant(token, organizationId);
    const coords = offsetCoords(BRANCH_ORIGIN, { north: 0, east: 2 });
    const base = { itemTotal: 50, deliveryFee: 74, discountTotal: 0, amountPayable: 124, currency: "INR" };

    const paidId = await pushBridgedOrder(organizationId, branchId, productId, { ...base, method: "ONLINE", status: "PAID" }, coords);
    const pendingId = await pushBridgedOrder(organizationId, branchId, productId, { ...base, method: "ONLINE", status: "PENDING" }, coords);
    const pickupId = await pushBridgedOrder(organizationId, branchId, productId, { ...base, method: "PAY_ON_PICKUP", status: "PENDING" }, coords);

    const get = async (id: string) =>
      (
        await request(app)
          .get(`/api/sales-orders/${id}`)
          .set("Authorization", `Bearer ${token}`)
          .set("x-organization-id", organizationId)
          .expect(200)
      ).body.data as Record<string, unknown>;

    const paid = await get(paidId);
    expect(paid.paymentStatus).toBe("PAID");
    expect(paid.amountToCollect).toBe(0);

    const pending = await get(pendingId);
    expect(pending.paymentStatus).toBe("UNPAID");
    expect(pending.amountToCollect).toBe(124);

    const pickup = await get(pickupId);
    expect(pickup.paymentStatus).toBe("UNPAID");
    expect(pickup.amountToCollect).toBe(0);
    expect(pickup.payment).toMatchObject({ method: "PAY_ON_PICKUP", amountPayable: 124 });
  });

  it("a push WITHOUT a payment block (older NearCart) behaves exactly as before: payment null, amountToCollect = total", async () => {
    const token = await getSuperAdminToken();
    const { organizationId, branchId } = await createOrgWithGeoBranch(token, {
      latitude: BRANCH_ORIGIN.lat,
      longitude: BRANCH_ORIGIN.lng,
    });
    const { productId } = await createTestVariant(token, organizationId);
    const coords = offsetCoords(BRANCH_ORIGIN, { north: 0, east: 3 });
    const orderId = await pushBridgedOrder(organizationId, branchId, productId, undefined, coords);

    const stored = await prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId } });
    const storedAddress = (
      typeof stored.deliveryAddress === "string" ? JSON.parse(stored.deliveryAddress) : stored.deliveryAddress
    ) as Record<string, unknown>;
    expect(storedAddress).toEqual({ addressLine: "12 Payment Test Street", latitude: coords.lat, longitude: coords.lng });

    const detail = await request(app)
      .get(`/api/sales-orders/${orderId}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-organization-id", organizationId)
      .expect(200);
    expect(detail.body.data.payment).toBeNull();
    expect(detail.body.data.amountToCollect).toBe(50);
  });

  it("rejects a malformed payment block with 400 instead of storing it", async () => {
    const token = await getSuperAdminToken();
    const { organizationId, branchId } = await createOrgWithGeoBranch(token, {
      latitude: BRANCH_ORIGIN.lat,
      longitude: BRANCH_ORIGIN.lng,
    });
    const { productId } = await createTestVariant(token, organizationId);

    const response = await request(app)
      .post(`/api/internal/marketplace/organizations/${organizationId}/sales-orders`)
      .set("x-internal-service-token", INTERNAL_TOKEN)
      .send({
        branchId,
        externalOrderId: `nc-order-${uniqueSuffix()}`,
        customer: { name: "Bad Payment", phone: "9000000001", addressLine: "x" },
        items: [{ inventoryProductId: productId, inventoryVariantId: null, quantity: 1, unitPrice: 25 }],
        payment: { method: "COD", amountPayable: -10 },
      });

    expect(response.status).toBe(400);
  });
});
