// Pure-logic tests for the NearCart money block carried on `SalesOrder.deliveryAddress.payment`
// (src/utils/orderPayment.ts) and the bridge's request schema for it. No DB, no HTTP.
//
// The bug these pin down: a NearCart order with item total 360 + delivery fee 74 (customer owes
// 434, cash on delivery) reached the driver app as "COLLECT CASH 360", because `SalesOrder.total`
// only ever meant goods value and nothing else about the customer's bill crossed the bridge.
import { describe, expect, it } from "vitest";

import { createBridgedSalesOrderSchema } from "../../src/modules/marketplace/marketplace.validation";
import {
  buildBridgedDeliveryAddress,
  buildOrderPaymentView,
  computeAmountToCollect,
  isPrepaidOnline,
  parseOrderPayment,
} from "../../src/utils/orderPayment";

const codPayment = {
  method: "COD" as const,
  status: "PENDING" as const,
  itemTotal: 360,
  deliveryFee: 74,
  discountTotal: 0,
  amountPayable: 434,
  currency: "INR",
};

const address = { addressLine: "12 Test Street", latitude: 23.03, longitude: 72.56 };

function baseBody(extra: Record<string, unknown> = {}) {
  return {
    branchId: "branch-1",
    externalOrderId: "order-1",
    customer: { name: "Asha", phone: "9999999999", ...address },
    items: [{ inventoryProductId: "p1", inventoryVariantId: null, quantity: 1, unitPrice: 360 }],
    ...extra,
  };
}

describe("createBridgedSalesOrderSchema: payment block", () => {
  it("is optional — an older NearCart that sends no payment still validates", () => {
    const parsed = createBridgedSalesOrderSchema.parse(baseBody());
    expect(parsed.payment).toBeUndefined();
  });

  it("accepts the full block, a partial block, and strips unknown keys instead of rejecting them", () => {
    expect(createBridgedSalesOrderSchema.parse(baseBody({ payment: codPayment })).payment).toEqual(codPayment);
    expect(createBridgedSalesOrderSchema.parse(baseBody({ payment: { method: "COD" } })).payment).toEqual({
      method: "COD",
    });
    expect(
      createBridgedSalesOrderSchema.parse(baseBody({ payment: { ...codPayment, somethingNew: true } })).payment,
    ).toEqual(codPayment);
  });

  it("rejects malformed money rather than storing garbage a driver would collect against", () => {
    for (const payment of [
      { ...codPayment, method: "CARD" },
      { ...codPayment, status: "UNPAID" },
      { ...codPayment, amountPayable: -1 },
      { ...codPayment, amountPayable: "434" },
      { ...codPayment, deliveryFee: null },
      { ...codPayment, amountPayable: Number.POSITIVE_INFINITY },
    ]) {
      expect(createBridgedSalesOrderSchema.safeParse(baseBody({ payment })).success).toBe(false);
    }
  });
});

describe("buildBridgedDeliveryAddress", () => {
  it("keeps today's exact shape when no payment is sent (incl. null for an empty address)", () => {
    expect(buildBridgedDeliveryAddress(address)).toEqual(address);
    expect(buildBridgedDeliveryAddress(address, null)).toEqual(address);
    expect(buildBridgedDeliveryAddress(address, {})).toEqual(address);
    expect(buildBridgedDeliveryAddress({})).toBeNull();
  });

  it("adds `payment` alongside the address keys without disturbing them", () => {
    expect(buildBridgedDeliveryAddress(address, codPayment)).toEqual({ ...address, payment: codPayment });
    expect(buildBridgedDeliveryAddress({}, codPayment)).toEqual({
      addressLine: null,
      latitude: null,
      longitude: null,
      payment: codPayment,
    });
  });
});

describe("parseOrderPayment", () => {
  it("returns null for orders with no payment block (walk-in/phone/older pushes) and for junk", () => {
    for (const value of [null, undefined, "", "not json", 42, [], address, { payment: null }, { payment: "COD" }]) {
      expect(parseOrderPayment(value)).toBeNull();
    }
  });

  it("parses an object AND the raw JSON string the libSQL adapter sometimes hands back", () => {
    const stored = { ...address, payment: codPayment };
    const expected = {
      method: "COD",
      status: "PENDING",
      itemTotal: 360,
      deliveryFee: 74,
      weatherSurchargeFee: null,
      discountTotal: 0,
      loyaltyDiscount: null,
      couponCode: null,
      amountPayable: 434,
      currency: "INR",
    };
    expect(parseOrderPayment(stored)).toEqual(expected);
    expect(parseOrderPayment(JSON.stringify(stored))).toEqual(expected);
  });

  it("nulls out unknown enum values / bad amounts instead of passing them through", () => {
    const parsed = parseOrderPayment({ payment: { method: "CARD", status: "UNPAID", amountPayable: -5 } });
    expect(parsed).toMatchObject({ method: null, status: null, amountPayable: null });
  });
});

describe("computeAmountToCollect (what the DRIVER collects at the door)", () => {
  const order = (payment: unknown, paymentStatus = "UNPAID", total: unknown = "360") => ({
    total,
    paymentStatus,
    deliveryAddress: payment === undefined ? address : { ...address, payment },
  });

  it("COD: the customer's full payable amount (434), NOT the goods total (360)", () => {
    expect(computeAmountToCollect(order(codPayment))).toBe(434);
  });

  it("COD with a discount: amountPayable already nets the discount off", () => {
    expect(computeAmountToCollect(order({ ...codPayment, discountTotal: 50, amountPayable: 384 }))).toBe(384);
  });

  it("ONLINE + PAID: nothing to collect", () => {
    expect(computeAmountToCollect(order({ ...codPayment, method: "ONLINE", status: "PAID" }))).toBe(0);
    expect(computeAmountToCollect(order({ ...codPayment, method: "ONLINE", status: "PAID" }, "PAID"))).toBe(0);
  });

  it("ONLINE but not confirmed paid: still collect — no money has actually moved", () => {
    for (const status of ["PENDING", "FAILED", "REFUNDED", undefined]) {
      expect(computeAmountToCollect(order({ ...codPayment, method: "ONLINE", status }))).toBe(434);
    }
  });

  it("PAY_ON_PICKUP: the shop collects, the driver collects 0", () => {
    expect(computeAmountToCollect(order({ ...codPayment, method: "PAY_ON_PICKUP" }))).toBe(0);
  });

  it("the order's own paymentStatus PAID always wins (staff marked it paid)", () => {
    expect(computeAmountToCollect(order(codPayment, "PAID"))).toBe(0);
  });

  it("no payment block: today's behaviour — goods total unless PAID", () => {
    expect(computeAmountToCollect(order(undefined))).toBe(360);
    expect(computeAmountToCollect(order(undefined, "PARTIAL"))).toBe(360);
    expect(computeAmountToCollect(order(undefined, "PAID"))).toBe(0);
    expect(computeAmountToCollect({ total: "360", paymentStatus: "UNPAID", deliveryAddress: null })).toBe(360);
    // Prisma.Decimal-like object
    expect(computeAmountToCollect({ total: { toString: () => "360.5" }, paymentStatus: "UNPAID" })).toBe(360.5);
  });

  it("a block without a usable method or amountPayable falls back to the goods total", () => {
    expect(computeAmountToCollect(order({ amountPayable: 434 }))).toBe(360);
    expect(computeAmountToCollect(order({ method: "COD" }))).toBe(360);
  });
});

describe("isPrepaidOnline / buildOrderPaymentView", () => {
  it("only ONLINE + PAID counts as prepaid", () => {
    expect(isPrepaidOnline({ method: "ONLINE", status: "PAID" })).toBe(true);
    expect(isPrepaidOnline({ method: "ONLINE", status: "PENDING" })).toBe(false);
    expect(isPrepaidOnline({ method: "COD", status: "PAID" })).toBe(false);
    expect(isPrepaidOnline({ method: "PAY_ON_PICKUP", status: "PAID" })).toBe(false);
    expect(isPrepaidOnline(null)).toBe(false);
    expect(isPrepaidOnline(undefined)).toBe(false);
  });

  it("exposes exactly { payment, amountToCollect }", () => {
    expect(
      buildOrderPaymentView({ total: "360", paymentStatus: "UNPAID", deliveryAddress: { ...address, payment: codPayment } }),
    ).toMatchObject({ amountToCollect: 434, payment: { method: "COD", amountPayable: 434, deliveryFee: 74 } });
    expect(buildOrderPaymentView({ total: "360", paymentStatus: "UNPAID", deliveryAddress: address })).toEqual({
      payment: null,
      amountToCollect: 360,
    });
  });
});
