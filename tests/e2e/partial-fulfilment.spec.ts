/**
 * Shop-side PARTIAL FULFILMENT with customer approval — "the customer ordered 5 things, I only
 * have 3 of them".
 *
 * The invariants under test are the ones that cost real money or real orders if they break:
 *
 *  - proposing commits NOTHING (order stays PENDING, no ledger row, item rows untouched);
 *  - accepting moves stock EXACTLY ONCE, for the FINAL quantities only;
 *  - declining/expiring moves no stock at all and cancels the order;
 *  - a second response is a no-op, not a double-apply;
 *  - the order-confirmation sweep does NOT auto-cancel an order still awaiting the customer.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { sweepExpiredPendingOrders } from "../../src/jobs/order-confirmation-sweep";
import { getSuperAdminToken } from "../helpers/auth";
import { confirmSalesOrder, createOrgWithGeoBranch, createTestVariant } from "../helpers/catalog";
import { uniqueSuffix } from "../helpers/ids";

// Indore — dedicated to this file so its orders can never be matched by another file's driver.
const BRANCH_ORIGIN = { lat: 22.7196, lng: 75.8577 };

const INTERNAL_TOKEN = process.env.MARKETPLACE_INTERNAL_TOKEN!;

// createTestVariant sells at 25. Two lines of 4 + 2 units = 150 of goods; NearCart adds a 40
// delivery fee on top, so the customer owes 190 before any partial fulfilment.
const UNIT_PRICE = 25;
const DELIVERY_FEE = 40;

type Scenario = {
  token: string;
  organizationId: string;
  branchId: string;
  orderId: string;
  externalOrderId: string;
  items: Array<{ id: string; productId: string; quantity: number }>;
};

async function setupBridgedOrder(quantities: [number, number] = [4, 2]): Promise<Scenario> {
  const token = await getSuperAdminToken();
  const { organizationId, branchId } = await createOrgWithGeoBranch(token, {
    latitude: BRANCH_ORIGIN.lat,
    longitude: BRANCH_ORIGIN.lng,
  });
  const first = await createTestVariant(token, organizationId);
  const second = await createTestVariant(token, organizationId);

  const externalOrderId = `nc-partial-${uniqueSuffix()}`;
  const itemTotal = (quantities[0] + quantities[1]) * UNIT_PRICE;

  const push = await request(app)
    .post(`/api/internal/marketplace/organizations/${organizationId}/sales-orders`)
    .set("x-internal-service-token", INTERNAL_TOKEN)
    .send({
      branchId,
      externalOrderId,
      externalOrderNumber: `NC-${externalOrderId}`,
      customer: {
        name: "Partial Fulfilment Customer",
        phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
        addressLine: "9 Partial Street",
        latitude: BRANCH_ORIGIN.lat + 0.01,
        longitude: BRANCH_ORIGIN.lng + 0.01,
      },
      items: [
        { inventoryProductId: first.productId, inventoryVariantId: null, quantity: quantities[0], unitPrice: UNIT_PRICE },
        { inventoryProductId: second.productId, inventoryVariantId: null, quantity: quantities[1], unitPrice: UNIT_PRICE },
      ],
      notes: null,
      payment: {
        method: "COD",
        status: "PENDING",
        itemTotal,
        deliveryFee: DELIVERY_FEE,
        discountTotal: 0,
        amountPayable: itemTotal + DELIVERY_FEE,
        currency: "INR",
      },
    });

  expect(push.status).toBe(201);
  const orderId = push.body.data.salesOrderId as string;

  const items = await prisma.salesOrderItem.findMany({
    where: { salesOrderId: orderId },
    orderBy: { createdAt: "asc" },
  });

  return {
    token,
    organizationId,
    branchId,
    orderId,
    externalOrderId,
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: Number(item.quantity),
    })),
  };
}

function proposePartial(
  scenario: Scenario,
  items: Array<{ salesOrderItemId: string; availableQuantity: number }>,
  note?: string,
) {
  return request(app)
    .post(`/api/sales-orders/${scenario.orderId}/propose-partial`)
    .set("Authorization", `Bearer ${scenario.token}`)
    .set("x-organization-id", scenario.organizationId)
    .send({ items, ...(note ? { note } : {}) });
}

function respondToProposal(scenario: Scenario, accepted: boolean, revisedPayment?: Record<string, unknown>) {
  return request(app)
    .post(
      `/api/internal/marketplace/organizations/${scenario.organizationId}/sales-orders/by-external/${scenario.externalOrderId}/partial-response`,
    )
    .set("x-internal-service-token", INTERNAL_TOKEN)
    .send({ accepted, ...(revisedPayment ? { revisedPayment } : {}) });
}

function getOrderDetail(scenario: Scenario) {
  return request(app)
    .get(`/api/sales-orders/${scenario.orderId}`)
    .set("Authorization", `Bearer ${scenario.token}`)
    .set("x-organization-id", scenario.organizationId);
}

async function countSaleMovements(orderId: string) {
  return prisma.inventoryLedger.count({ where: { referenceId: orderId, movementType: "SALE" } });
}

describe("partial fulfilment: propose", () => {
  it("commits nothing — order stays PENDING, no stock moves, item rows are untouched", async () => {
    const scenario = await setupBridgedOrder();

    const proposal = await proposePartial(scenario, [
      { salesOrderItemId: scenario.items[0]!.id, availableQuantity: 2 },
      { salesOrderItemId: scenario.items[1]!.id, availableQuantity: 0 },
    ], "Only 2 left on the shelf");

    expect(proposal.status).toBe(200);

    const stored = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: scenario.orderId },
      include: { items: true },
    });

    // The whole point of staying PENDING: nothing is committed until the customer answers.
    expect(stored.status).toBe("PENDING");
    expect(stored.items).toHaveLength(2);
    expect(stored.items.map((item) => Number(item.quantity)).sort()).toEqual([2, 4]);
    expect(Number(stored.total)).toBe(150);
    expect(await countSaleMovements(scenario.orderId)).toBe(0);

    const detail = await getOrderDetail(scenario);
    expect(detail.status).toBe(200);
    const partial = detail.body.data.partialFulfilment;
    expect(partial.state).toBe("AWAITING_CUSTOMER");
    expect(partial.note).toBe("Only 2 left on the shelf");
    expect(partial.originalTotal).toBe(150);
    expect(partial.proposedTotal).toBe(50);
    // Item total drops 150 -> 50; the delivery fee is untouched because a driver still rides.
    expect(partial.proposedAmountPayable).toBe(50 + DELIVERY_FEE);
    expect(partial.reducedItems).toHaveLength(1);
    expect(partial.reducedItems[0]).toMatchObject({ fromQuantity: 4, toQuantity: 2, lineTotal: 50 });
    expect(partial.removedItems).toHaveLength(1);
    expect(partial.removedItems[0]).toMatchObject({ quantity: 2, lineTotal: 50 });
    // NearCart matches its own OrderItems on these, not on the SalesOrderItem id.
    expect(partial.removedItems[0].productId).toBe(scenario.items[1]!.productId);

    // The sweep's deadline is pushed out to the proposal's expiry, so the shop's own
    // confirmation SLA can't auto-cancel an order that is now waiting on a human.
    expect(stored.confirmationDeadlineAt?.toISOString()).toBe(partial.expiresAt);
  });

  it("refuses a proposal that leaves nothing to supply — that is a rejection, not a partial fulfilment", async () => {
    const scenario = await setupBridgedOrder();

    const response = await proposePartial(scenario, [
      { salesOrderItemId: scenario.items[0]!.id, availableQuantity: 0 },
      { salesOrderItemId: scenario.items[1]!.id, availableQuantity: 0 },
    ]);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/reject the order instead/i);
    expect((await prisma.salesOrder.findUniqueOrThrow({ where: { id: scenario.orderId } })).status).toBe("PENDING");
  });

  it("refuses a proposal that changes nothing, and one that promises more than was ordered", async () => {
    const scenario = await setupBridgedOrder();

    const unchanged = await proposePartial(scenario, [
      { salesOrderItemId: scenario.items[0]!.id, availableQuantity: scenario.items[0]!.quantity },
    ]);
    expect(unchanged.status).toBe(400);
    expect(unchanged.body.message).toMatch(/does not change the order/i);

    const tooMany = await proposePartial(scenario, [
      { salesOrderItemId: scenario.items[0]!.id, availableQuantity: scenario.items[0]!.quantity + 1 },
    ]);
    expect(tooMany.status).toBe(400);

    const foreignItem = await proposePartial(scenario, [
      { salesOrderItemId: "not-an-item-on-this-order", availableQuantity: 1 },
    ]);
    expect(foreignItem.status).toBe(400);
  });

  it("cannot be proposed once the order is confirmed", async () => {
    const scenario = await setupBridgedOrder();
    await confirmSalesOrder(scenario.token, scenario.organizationId, scenario.orderId);

    const response = await proposePartial(scenario, [
      { salesOrderItemId: scenario.items[0]!.id, availableQuantity: 1 },
    ]);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/already confirmed/i);
  });

  it("cannot be proposed twice while the customer is still deciding", async () => {
    const scenario = await setupBridgedOrder();

    expect((await proposePartial(scenario, [{ salesOrderItemId: scenario.items[0]!.id, availableQuantity: 1 }])).status).toBe(200);

    const second = await proposePartial(scenario, [
      { salesOrderItemId: scenario.items[0]!.id, availableQuantity: 2 },
    ]);
    expect(second.status).toBe(409);
  });
});

describe("partial fulfilment: customer accepts", () => {
  it("applies the reduced order, confirms it, and moves stock exactly once for the final quantities", async () => {
    const scenario = await setupBridgedOrder();
    const keptItem = scenario.items[0]!;
    const droppedItem = scenario.items[1]!;

    await proposePartial(scenario, [
      { salesOrderItemId: keptItem.id, availableQuantity: 2 },
      { salesOrderItemId: droppedItem.id, availableQuantity: 0 },
    ]).expect(200);

    const response = await respondToProposal(scenario, true);
    expect(response.status).toBe(200);
    expect(response.body.data.applied).toBe(true);
    expect(response.body.data.status).toBe("CONFIRMED");
    expect(response.body.data.partialFulfilment.state).toBe("ACCEPTED");
    expect(response.body.data.partialFulfilment.respondedAt).not.toBeNull();

    const stored = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: scenario.orderId },
      include: { items: true },
    });

    expect(stored.status).toBe("CONFIRMED");
    expect(stored.confirmedAt).not.toBeNull();
    // Nobody on the shop's staff confirmed this — the customer's approval did.
    expect(stored.confirmedById).toBeNull();

    // The unsuppliable line is gone, the reduced line is at its new quantity.
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]!.id).toBe(keptItem.id);
    expect(Number(stored.items[0]!.quantity)).toBe(2);
    expect(Number(stored.items[0]!.lineTotal)).toBe(50);
    expect(Number(stored.subtotal)).toBe(50);
    expect(Number(stored.total)).toBe(50);

    // Stock: one movement, for the FINAL quantity (2), never the originally-ordered 4.
    const movements = await prisma.inventoryLedger.findMany({
      where: { referenceId: scenario.orderId, movementType: "SALE" },
    });
    expect(movements).toHaveLength(1);
    expect(Number(movements[0]!.quantityDelta)).toBe(-2);

    const balance = await prisma.inventoryBalance.findFirstOrThrow({
      where: { organizationId: scenario.organizationId, variantId: movements[0]!.variantId },
    });
    expect(Number(balance.onHand)).toBe(-2);

    // Nothing was deducted for the dropped line at all.
    const droppedBalance = await prisma.inventoryBalance.findFirst({
      where: { organizationId: scenario.organizationId, productId: droppedItem.productId },
    });
    expect(droppedBalance).toBeNull();

    // Money: the shop and the driver must be told the revised figure, not the original one.
    const detail = await getOrderDetail(scenario);
    expect(detail.body.data.payment).toMatchObject({
      method: "COD",
      itemTotal: 50,
      deliveryFee: DELIVERY_FEE,
      amountPayable: 50 + DELIVERY_FEE,
    });
    expect(detail.body.data.amountToCollect).toBe(50 + DELIVERY_FEE);
    expect(Number(detail.body.data.total)).toBe(50);
  });

  it("uses NearCart's revisedPayment when it corrects the bill (e.g. a coupon that no longer applies)", async () => {
    const scenario = await setupBridgedOrder();

    await proposePartial(scenario, [
      { salesOrderItemId: scenario.items[0]!.id, availableQuantity: 1 },
    ]).expect(200);

    // NearCart dropped a 30-off coupon whose minimum spend the reduced basket no longer meets,
    // so what the customer owes is HIGHER than our own proposedAmountPayable would suggest.
    await respondToProposal(scenario, true, {
      discountTotal: 0,
      couponCode: null,
      amountPayable: 115,
    }).expect(200);

    const detail = await getOrderDetail(scenario);
    expect(detail.body.data.payment).toMatchObject({ discountTotal: 0, amountPayable: 115 });
    // The dropped coupon is removed from the stored block outright; the serializer's parsed view
    // normalizes "no coupon" to null (see parseOrderPayment).
    expect(detail.body.data.payment.couponCode).toBeNull();
    expect(detail.body.data.amountToCollect).toBe(115);
  });

  it("is idempotent — a second response never double-applies", async () => {
    const scenario = await setupBridgedOrder();

    await proposePartial(scenario, [
      { salesOrderItemId: scenario.items[0]!.id, availableQuantity: 2 },
      { salesOrderItemId: scenario.items[1]!.id, availableQuantity: 0 },
    ]).expect(200);

    await respondToProposal(scenario, true).expect(200);

    const replay = await respondToProposal(scenario, true);
    expect(replay.status).toBe(200);
    expect(replay.body.data.applied).toBe(false);
    expect(replay.body.data.status).toBe("CONFIRMED");

    // A declining replay must not cancel an order the customer already accepted either.
    const contradictoryReplay = await respondToProposal(scenario, false);
    expect(contradictoryReplay.status).toBe(200);
    expect(contradictoryReplay.body.data.applied).toBe(false);
    expect(contradictoryReplay.body.data.status).toBe("CONFIRMED");

    expect(await countSaleMovements(scenario.orderId)).toBe(1);
    const stored = await prisma.salesOrder.findUniqueOrThrow({ where: { id: scenario.orderId } });
    expect(stored.status).toBe("CONFIRMED");
    expect(Number(stored.total)).toBe(50);
  });
});

describe("partial fulfilment: customer declines", () => {
  it("cancels the order with a clear reason and moves no stock", async () => {
    const scenario = await setupBridgedOrder();

    await proposePartial(scenario, [
      { salesOrderItemId: scenario.items[0]!.id, availableQuantity: 1 },
      { salesOrderItemId: scenario.items[1]!.id, availableQuantity: 0 },
    ]).expect(200);

    const response = await respondToProposal(scenario, false);
    expect(response.status).toBe(200);
    expect(response.body.data.applied).toBe(true);
    expect(response.body.data.status).toBe("CANCELLED");
    expect(response.body.data.partialFulfilment.state).toBe("DECLINED");

    const stored = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: scenario.orderId },
      include: { items: true },
    });

    expect(stored.status).toBe("CANCELLED");
    expect(stored.rejectionReason).toBe("Customer declined the revised order");
    // A refused proposal leaves the order's books completely untouched.
    expect(stored.items).toHaveLength(2);
    expect(Number(stored.total)).toBe(150);
    expect(await countSaleMovements(scenario.orderId)).toBe(0);
    expect(
      await prisma.inventoryLedger.count({ where: { referenceId: scenario.orderId } }),
    ).toBe(0);
  });

  it("rejects a response when there is no proposal awaiting an answer", async () => {
    const scenario = await setupBridgedOrder();

    const response = await respondToProposal(scenario, true);
    expect(response.status).toBe(409);
  });
});

describe("partial fulfilment: expiry and the confirmation sweep", () => {
  it("does NOT auto-cancel an order still inside the customer's response window", async () => {
    const scenario = await setupBridgedOrder();

    await proposePartial(scenario, [
      { salesOrderItemId: scenario.items[0]!.id, availableQuantity: 1 },
    ]).expect(200);

    // Force the shop's own confirmation deadline into the past while the customer's window is
    // still open — the exact situation that would silently kill a live order if the sweep only
    // looked at confirmationDeadlineAt.
    await prisma.salesOrder.update({
      where: { id: scenario.orderId },
      data: { confirmationDeadlineAt: new Date(Date.now() - 60_000) },
    });

    await sweepExpiredPendingOrders();

    const stored = await prisma.salesOrder.findUniqueOrThrow({ where: { id: scenario.orderId } });
    expect(stored.status).toBe("PENDING");
    expect(stored.rejectionReason).toBeNull();
  });

  it("expires a proposal the customer never answered, cancelling the order without touching stock", async () => {
    const scenario = await setupBridgedOrder();

    await proposePartial(scenario, [
      { salesOrderItemId: scenario.items[0]!.id, availableQuantity: 1 },
    ]).expect(200);

    const beforeSweep = await prisma.salesOrder.findUniqueOrThrow({ where: { id: scenario.orderId } });
    const address = (
      typeof beforeSweep.deliveryAddress === "string"
        ? JSON.parse(beforeSweep.deliveryAddress)
        : beforeSweep.deliveryAddress
    ) as Record<string, Record<string, unknown>>;

    const expired = new Date(Date.now() - 60_000).toISOString();
    await prisma.salesOrder.update({
      where: { id: scenario.orderId },
      data: {
        confirmationDeadlineAt: new Date(expired),
        deliveryAddress: {
          ...address,
          partialFulfilment: { ...address.partialFulfilment, expiresAt: expired },
        },
      },
    });

    const result = await sweepExpiredPendingOrders();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const stored = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: scenario.orderId },
      include: { items: true },
    });

    expect(stored.status).toBe("CANCELLED");
    expect(stored.rejectionReason).toBe("Customer did not respond to the revised order");
    expect(stored.items).toHaveLength(2);
    expect(await countSaleMovements(scenario.orderId)).toBe(0);

    const detail = await getOrderDetail(scenario);
    expect(detail.body.data.partialFulfilment.state).toBe("EXPIRED");

    // Answering after expiry must not resurrect the order.
    const lateResponse = await respondToProposal(scenario, true);
    expect(lateResponse.status).toBe(200);
    expect(lateResponse.body.data.applied).toBe(false);
    expect(lateResponse.body.data.status).toBe("CANCELLED");
    expect(await countSaleMovements(scenario.orderId)).toBe(0);
  });
});
