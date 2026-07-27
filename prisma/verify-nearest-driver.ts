/**
 * One-off verification script (not part of the seed pipeline) for the nearest-free-driver
 * auto-assignment feature built this session. Creates a CONFIRMED test SalesOrder against the
 * seeded "Bandra Fresh Mart" branch (Mumbai, lat 19.0596/lng 72.8295), calls the real
 * markSalesOrderReady() service function (same one the PATCH /:id/mark-ready route calls), then
 * reads the order back from the DB to confirm a driver got auto-assigned — and that it's the
 * *nearest* seeded Mumbai driver (Rajesh Kadam @ 19.055/72.84, ~1.2km away) rather than the
 * farther one (Suresh Pawar @ 18.91/72.82, ~16.6km away — outside the 15km DRIVER_MATCH_RADIUS_KM
 * default, so he should not even be eligible).
 *
 * Run with: node --import tsx prisma/verify-nearest-driver.ts
 */
import { readFileSync } from "node:fs";

import { OrderSource, SalesOrderStatus } from "@prisma/client";

import { prisma } from "../src/config/prisma";
import { markSalesOrderReady } from "../src/modules/sales-orders/sales-orders.service";
import { generateDocumentNumber } from "../src/utils/numbering";

const MANIFEST_PATH = "prisma/seed-multi-city.manifest.json";

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const bandra = manifest.shops.find((s: { shopSlug: string }) => s.shopSlug === "bandra-fresh-mart");

  if (!bandra) {
    throw new Error("bandra-fresh-mart not found in manifest — run seed-multi-city.ts first");
  }

  console.log(`Target branch: Bandra Fresh Mart (${bandra.branchId}) @ (${bandra.latitude}, ${bandra.longitude})`);

  const variant = await prisma.productVariant.findFirst({
    where: { organizationId: bandra.organizationId, sku: "BFM-MILK-500" },
    include: { product: true },
  });

  if (!variant) {
    throw new Error("BFM-MILK-500 variant not found — did the catalog seed run?");
  }

  // Any existing platform user works as the audit-log actor for markSalesOrderReady (it only
  // needs a valid User id to satisfy SalesOrder.readyById's FK — it does not need org membership
  // for this direct-service-call test, unlike the real HTTP route which enforces that).
  const actor = await prisma.user.findFirst({ select: { id: true } });

  if (!actor) {
    throw new Error("No User rows exist in this DB to use as a test actor");
  }

  let customer = await prisma.customer.findFirst({
    where: { organizationId: bandra.organizationId, phone: "+919999999999" },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        organizationId: bandra.organizationId,
        name: "Driver-Match Verification Customer",
        phone: "+919999999999",
      },
    });
  }

  const order = await prisma.salesOrder.create({
    data: {
      organizationId: bandra.organizationId,
      branchId: bandra.branchId,
      customerId: customer.id,
      orderNumber: generateDocumentNumber("VERIFY"),
      source: OrderSource.WALK_IN,
      status: SalesOrderStatus.CONFIRMED,
      confirmedAt: new Date(),
      confirmedById: actor.id,
      subtotal: variant.sellingPrice,
      total: variant.sellingPrice,
      items: {
        create: [
          {
            productId: variant.productId,
            variantId: variant.id,
            productNameSnapshot: variant.product.name,
            variantNameSnapshot: variant.name,
            skuSnapshot: variant.sku,
            quantity: 1,
            unitPrice: variant.sellingPrice,
            lineTotal: variant.sellingPrice,
          },
        ],
      },
    },
  });

  console.log(`Created test SalesOrder ${order.id} (${order.orderNumber}) status=CONFIRMED`);

  console.log("Calling markSalesOrderReady() ...");
  await markSalesOrderReady(bandra.organizationId, order.id, actor.id);

  const updated = await prisma.salesOrder.findUniqueOrThrow({
    where: { id: order.id },
    include: { assignedDriver: true },
  });

  console.log("\n=== Result ===");
  console.log(`Order status: ${updated.status}`);
  console.log(`assignedDriverId: ${updated.assignedDriverId}`);

  if (updated.assignedDriver) {
    console.log(
      `Assigned driver: ${updated.assignedDriver.fullName} (${updated.assignedDriver.phone}) @ (${updated.assignedDriver.lastKnownLatitude}, ${updated.assignedDriver.lastKnownLongitude})`,
    );
    console.log(
      updated.assignedDriver.fullName === "Rajesh Kadam"
        ? "PASS: nearest Mumbai driver (Rajesh Kadam) was auto-assigned, as expected."
        : `UNEXPECTED: expected Rajesh Kadam to be nearest, got ${updated.assignedDriver.fullName}`,
    );
  } else {
    console.log("FAIL: no driver was auto-assigned.");
  }
}

main()
  .catch((error) => {
    console.error("Verification failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
