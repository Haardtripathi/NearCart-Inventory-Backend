import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { getOrCreateIndustryId } from "./auth";
import { uniqueSuffix } from "./ids";

/**
 * Creates an organization via `POST /api/organizations` (first branch, no coordinates — see
 * org-branch-creation.spec.ts for a dedicated check of that), then a SEPARATE geo-enabled branch
 * via `POST /branches` with the given lat/lng. This second branch is the one every matching/fare
 * scenario in this suite actually uses — the org's `firstBranch` deliberately never carries
 * coordinates (see branches.validation.ts's doc comment: not every shop owner has them handy at
 * signup time), so a branch usable for nearest-free-driver matching has to be created via the
 * dedicated `POST /branches` path.
 */
export async function createOrgWithGeoBranch(
  token: string,
  branchCoords: { latitude: number; longitude: number },
  namePrefix = "Test Org",
): Promise<{ organizationId: string; branchId: string }> {
  const industryId = await getOrCreateIndustryId(token);
  const suffix = uniqueSuffix();
  const orgName = `${namePrefix} ${suffix}`;

  const orgResponse = await request(app)
    .post("/api/organizations")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: orgName,
      primaryIndustryId: industryId,
      firstBranch: {
        name: `${orgName} HQ`,
        type: "STORE",
      },
    });

  if (orgResponse.status !== 201) {
    throw new Error(`Failed to create organization: ${orgResponse.status} ${JSON.stringify(orgResponse.body)}`);
  }

  const organizationId = orgResponse.body.data.id as string;

  const branchResponse = await request(app)
    .post("/api/branches")
    .set("Authorization", `Bearer ${token}`)
    .set("x-organization-id", organizationId)
    .send({
      name: `${orgName} Geo Branch`,
      type: "STORE",
      latitude: branchCoords.latitude,
      longitude: branchCoords.longitude,
    });

  if (branchResponse.status !== 201) {
    throw new Error(`Failed to create geo-enabled branch: ${branchResponse.status} ${JSON.stringify(branchResponse.body)}`);
  }

  return { organizationId, branchId: branchResponse.body.data.id as string };
}

/**
 * Creates a minimal sellable SIMPLE product + its single default variant, with
 * `allowNegativeStock: true` — every scenario here cares about order/driver-matching/fare
 * behavior, not real inventory levels, and standing up a purchase receipt just to get positive
 * on-hand stock before every sales order would be unrelated setup noise. `trackInventory` is left
 * at its schema default (`true`) since `applyStockMovement` (called by confirmSalesOrder) actively
 * REJECTS movements for a product with tracking disabled — allowNegativeStock is what lets confirm
 * succeed with zero real stock, not disabling tracking.
 */
export async function createTestVariant(
  token: string,
  organizationId: string,
): Promise<{ productId: string; variantId: string }> {
  const suffix = uniqueSuffix();

  const response = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .set("x-organization-id", organizationId)
    .send({
      name: `Test Product ${suffix}`,
      productType: "SIMPLE",
      allowNegativeStock: true,
      defaultVariant: {
        sku: `SKU-${suffix}`,
        costPrice: 10,
        sellingPrice: 25,
      },
    });

  if (response.status !== 201) {
    throw new Error(`Failed to create test product: ${response.status} ${JSON.stringify(response.body)}`);
  }

  const product = response.body.data;
  return { productId: product.id as string, variantId: product.variants[0].id as string };
}

/** POST /api/sales-orders (staff-entered, POS-style creation) — returns the new order's id. */
export async function createSalesOrder(
  token: string,
  organizationId: string,
  branchId: string,
  item: { productId: string; variantId: string; quantity?: number },
): Promise<string> {
  const response = await request(app)
    .post("/api/sales-orders")
    .set("Authorization", `Bearer ${token}`)
    .set("x-organization-id", organizationId)
    .send({
      branchId,
      items: [{ productId: item.productId, variantId: item.variantId, quantity: item.quantity ?? 1 }],
    });

  if (response.status !== 201) {
    throw new Error(`Failed to create sales order: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body.data.id as string;
}

export async function confirmSalesOrder(token: string, organizationId: string, orderId: string) {
  const response = await request(app)
    .post(`/api/sales-orders/${orderId}/confirm`)
    .set("Authorization", `Bearer ${token}`)
    .set("x-organization-id", organizationId);

  if (response.status !== 200) {
    throw new Error(`Failed to confirm sales order ${orderId}: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body.data;
}

export async function markSalesOrderReady(token: string, organizationId: string, orderId: string) {
  const response = await request(app)
    .patch(`/api/sales-orders/${orderId}/mark-ready`)
    .set("Authorization", `Bearer ${token}`)
    .set("x-organization-id", organizationId);

  if (response.status !== 200) {
    throw new Error(`Failed to mark sales order ${orderId} ready: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body.data;
}

/**
 * KNOWN GAP (flagged in this suite's final report, not something this task is fixing): there is
 * no staff-facing field on either `POST /api/sales-orders` (createSalesOrderSchema) or
 * `PATCH /api/sales-orders/:id` (updateSalesOrderSchema) to set `SalesOrder.deliveryAddress` — it
 * is only ever written by the marketplace bridge's createBridgedSalesOrder (see
 * marketplace.service.ts). Since markSalesOrderReady's distance-based fare/matching logic reads
 * `order.deliveryAddress`, and this suite is explicitly scoped to the staff-facing POS-style
 * create endpoint (not the marketplace bridge — that's out of scope per this task's own
 * constraints), the only way to exercise that logic against a staff-created order is to backfill
 * the column directly via Prisma, same as the task brief's own suggested pattern for asserting
 * against `AuditLog`/`declinedByDriverIds` directly. This is test setup, not a workaround for a
 * bug in the code under test.
 */
export async function setDeliveryAddressCoords(
  orderId: string,
  coords: { latitude: number; longitude: number },
  addressLine = "123 Test Delivery Street",
) {
  await prisma.salesOrder.update({
    where: { id: orderId },
    data: {
      deliveryAddress: { addressLine, latitude: coords.latitude, longitude: coords.longitude },
    },
  });
}
