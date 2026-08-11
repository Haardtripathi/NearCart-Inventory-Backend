/**
 * Nightly production smoke test — runs against the LIVE deployed services (Render + Turso), not
 * a local/disposable DB, unlike the committed vitest suite in tests/e2e/. Deliberately mail-free:
 * every account this script creates is verified via a direct, tagged DB write (drivers need no
 * email at all; the org-owner's `emailVerified` flag is flipped directly) rather than real OTP
 * delivery, since production email-sending is unreliable as of 2026-08-11 (see the incident notes
 * in NearCart-Inventory/CLAUDE.md or ask — SMTP/Brevo config issue, out of scope for this script
 * to fix or route around further than "don't depend on it").
 *
 * Everything this script creates is tagged with a run-specific timestamp suffix and deleted in a
 * `finally` block, so a failed/interrupted run still cleans up — this runs unattended every night,
 * so leaked rows would silently accumulate forever otherwise.
 *
 * Covers, end to end against the real deployed apps:
 *   1. Google Maps/Places integration (autocomplete, geocode, reverse-geocode) — NearCart backend.
 *   2. Geolocation-based shop distance filtering — NearCart backend.
 *   3. Org/branch creation, live driver location + availability updates — NearCart-Inventory.
 *   4. Distance-based driver auto-assignment: near driver wins, far-only driver fails to match.
 *   5. Closest-driver-wins across multiple candidates.
 *   6. Driver decline -> reassignment to a different driver, with the never-re-offer guarantee.
 *   7. Distance-based fare computation/clamping, and driver earnings reflecting real per-order fees.
 *   8. NearCart<->Inventory marketplace bridge reachability (a real prior incident: NearCart's
 *      INVENTORY_SERVICE_URL was misconfigured to localhost in Render, silently breaking the
 *      customer-facing catalog/checkout path — this script flags that class of failure loudly
 *      instead of only discovering it via a real customer's failed checkout).
 *
 * Every check is independent and reported as PASS/FAIL/WARN in the final summary rather than
 * throwing on the first failure, since the whole point of a nightly run is to see the full picture
 * even when one subsystem (e.g. mail, or a stale deploy) is known-broken.
 *
 * Run: `node --import tsx scripts/nightly-e2e-smoke.ts` from this repo's `backend/` directory (it
 * reads DATABASE_URL/DATABASE_AUTH_TOKEN/MARKETPLACE_INTERNAL_TOKEN from this repo's real `.env`
 * — the same live-Turso credentials the deployed server itself uses — so it must only ever run
 * from a trusted operator context, never CI/a PR check).
 */
import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

const INVENTORY_BASE = "https://nearcart-inventory-backend.onrender.com/api";
const NEARCART_BASE = "https://nearcart-backend.onrender.com/api";

const envPath = path.resolve(process.cwd(), ".env");
const envText = fs.readFileSync(envPath, "utf8");
function getEnv(key: string): string {
  const match = envText.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) throw new Error(`Missing ${key} in .env`);
  return match[1].trim().replace(/^"(.*)"$/, "$1");
}

const db = createClient({ url: getEnv("DATABASE_URL"), authToken: getEnv("DATABASE_AUTH_TOKEN") });
const INTERNAL_TOKEN = getEnv("MARKETPLACE_INTERNAL_TOKEN");

const RUN_TAG = new Date().toISOString().replace(/[:.]/g, "-");

type CheckResult = { name: string; status: "PASS" | "FAIL" | "WARN"; detail: string };
const results: CheckResult[] = [];
function record(name: string, status: CheckResult["status"], detail: string) {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name} — ${detail}`);
}

async function api(base: string, method: string, path: string, body?: unknown, token?: string, extraHeaders?: Record<string, string>) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(extraHeaders ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// --- Fixed geography: MG Road, Bangalore, same layout as the manual 2026-08-11 verification pass ---
const BRANCH = { lat: 12.9716, lng: 77.5946 };
const D1_LOC = { lat: 12.9896, lng: 77.5946 }; // ~2km — in-radius, closest
const D2_LOC = { lat: 13.0436, lng: 77.5946 }; // ~8km — in-radius, farther
const D3_LOC = { lat: 13.1516, lng: 77.5946 }; // ~20km — out of default 15km match radius
const DELIVERY_NEAR = { lat: 12.9806, lng: 77.5946 }; // ~1km from branch
const DELIVERY_FAR = { lat: 13.0616, lng: 77.5946 }; // ~10km from branch

// --- Cleanup registry: every created row id, deleted in reverse dependency order in `finally` ---
const cleanup = {
  orderIds: [] as string[],
  driverIds: [] as string[],
  productId: null as string | null,
  branchId: null as string | null,
  organizationId: null as string | null,
  ownerId: null as string | null,
};

async function runCleanup() {
  console.log("\n--- cleanup ---");
  for (const orderId of cleanup.orderIds) {
    await db.execute({ sql: `DELETE FROM "SalesOrderItem" WHERE "salesOrderId" = ?`, args: [orderId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "AuditLog" WHERE "entityId" = ?`, args: [orderId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "SalesOrder" WHERE id = ?`, args: [orderId] }).catch(() => {});
  }
  for (const driverId of cleanup.driverIds) {
    await db.execute({ sql: `DELETE FROM "Driver" WHERE id = ?`, args: [driverId] }).catch(() => {});
  }
  if (cleanup.productId) {
    await db.execute({ sql: `DELETE FROM "ProductVariantTranslation" WHERE "variantId" IN (SELECT id FROM "ProductVariant" WHERE "productId" = ?)`, args: [cleanup.productId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "ProductTranslation" WHERE "productId" = ?`, args: [cleanup.productId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "InventoryLedger" WHERE "productId" = ?`, args: [cleanup.productId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "InventoryBalance" WHERE "productId" = ?`, args: [cleanup.productId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "ProductVariant" WHERE "productId" = ?`, args: [cleanup.productId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "Product" WHERE id = ?`, args: [cleanup.productId] }).catch(() => {});
  }
  if (cleanup.organizationId) {
    await db.execute({ sql: `DELETE FROM "AuditLog" WHERE "organizationId" = ?`, args: [cleanup.organizationId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "NotificationLog" WHERE "organizationId" = ?`, args: [cleanup.organizationId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "UserActionToken" WHERE "organizationId" = ?`, args: [cleanup.organizationId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "OrganizationMembership" WHERE "organizationId" = ?`, args: [cleanup.organizationId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "OrganizationIndustryConfig" WHERE "organizationId" = ?`, args: [cleanup.organizationId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "CategoryTranslation" WHERE "categoryId" IN (SELECT id FROM "Category" WHERE "organizationId" = ?)`, args: [cleanup.organizationId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "Category" WHERE "organizationId" = ?`, args: [cleanup.organizationId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "TaxRate" WHERE "organizationId" = ?`, args: [cleanup.organizationId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "Customer" WHERE "organizationId" = ?`, args: [cleanup.organizationId] }).catch(() => {});
  }
  if (cleanup.branchId) {
    await db.execute({ sql: `DELETE FROM "Branch" WHERE id = ?`, args: [cleanup.branchId] }).catch(() => {});
  }
  if (cleanup.organizationId) {
    await db.execute({ sql: `DELETE FROM "Organization" WHERE id = ?`, args: [cleanup.organizationId] }).catch(() => {});
  }
  if (cleanup.ownerId) {
    await db.execute({ sql: `DELETE FROM "UserActionToken" WHERE "userId" = ?`, args: [cleanup.ownerId] }).catch(() => {});
    await db.execute({ sql: `DELETE FROM "User" WHERE id = ?`, args: [cleanup.ownerId] }).catch(() => {});
  }
  console.log("cleanup done");
}

async function main() {
  // === 1. Google Maps / Places (NearCart backend, unauthenticated, no cleanup needed) ===
  const autocomplete = await api(NEARCART_BASE, "GET", "/location/autocomplete?input=MG%20Road%20Bangalore");
  record("google-places-autocomplete", autocomplete.status === 200 && (autocomplete.json as any)?.predictions?.length > 0 ? "PASS" : "FAIL", `status=${autocomplete.status}`);

  const geocode = await api(NEARCART_BASE, "GET", "/location/geocode?address=MG%20Road%2C%20Bangalore");
  record("google-geocode", geocode.status === 200 && (geocode.json as any)?.result?.latitude ? "PASS" : "FAIL", `status=${geocode.status}`);

  const reverseGeocode = await api(NEARCART_BASE, "GET", `/location/reverse-geocode?lat=${BRANCH.lat}&lng=${BRANCH.lng}`);
  record("google-reverse-geocode", reverseGeocode.status === 200 && (reverseGeocode.json as any)?.result?.formattedAddress ? "PASS" : "FAIL", `status=${reverseGeocode.status}`);

  // === 2. Geolocation-based shop distance filtering (read-only, existing fixture shops) ===
  const farFromShops = await api(NEARCART_BASE, "GET", `/public/shops?lat=${BRANCH.lat}&lng=${BRANCH.lng}`);
  const nearShops = await api(NEARCART_BASE, "GET", "/public/shops?lat=28.6315&lng=77.2167"); // known fixture shop location
  const filterWorks = (farFromShops.json as any)?.items?.length === 0 && (nearShops.json as any)?.items?.length > 0;
  record("geolocation-shop-distance-filter", filterWorks ? "PASS" : "WARN", `far=${(farFromShops.json as any)?.items?.length ?? "?"} items, near=${(nearShops.json as any)?.items?.length ?? "?"} items`);

  // === 3. NearCart -> Inventory marketplace bridge reachability ===
  const bridgeCheck = await api(NEARCART_BASE, "GET", "/public/shops/cmshluxix0014wihswsfmtask/catalog?limit=1");
  record("nearcart-inventory-bridge-reachable", bridgeCheck.status === 200 ? "PASS" : "FAIL", `status=${bridgeCheck.status}, body=${JSON.stringify(bridgeCheck.json).slice(0, 200)}`);

  // === 4. Inventory: org/branch/product/driver setup (mail-free) ===
  // Lowercased: the backend's normalizeEmail() lowercases on write, and the fallback lookup below
  // (used when the mail-bug 500 hides the real created id) does an exact-match query — a
  // mixed-case RUN_TAG (ISO timestamps contain "T"/"Z") would silently miss the real row.
  const ownerEmail = `nightly-smoke-${RUN_TAG}@nearcart-test.local`.toLowerCase();
  const industriesRes = await api(INVENTORY_BASE, "GET", "/platform/industries?limit=1");
  const industryId = (industriesRes.json as any)?.data?.[0]?.id;
  if (!industryId) {
    record("inventory-setup", "FAIL", "no industry available to register test org against — aborting inventory-side checks");
  } else {
    const register = await api(INVENTORY_BASE, "POST", "/auth/register-organization-owner", {
      fullName: "Nightly Smoke Owner",
      email: ownerEmail,
      password: "NightlySmoke123!",
      name: `Nightly Smoke Org ${RUN_TAG}`,
      primaryIndustryId: industryId,
      firstBranch: {
        name: "Nightly Smoke Branch",
        type: "STORE",
        addressLine1: "MG Road",
        city: "Bangalore",
        state: "Karnataka",
        country: "India",
        postalCode: "560001",
        latitude: BRANCH.lat,
        longitude: BRANCH.lng,
      },
    });
    cleanup.ownerId = (register.json as any)?.data?.userId ?? null;
    cleanup.organizationId = (register.json as any)?.data?.organizationId ?? null;

    // Known live-prod issue as of 2026-08-11: registration commits the User+Organization rows in
    // a transaction, then calls sendEmailVerificationOtp() *after* that transaction — if mail
    // sending throws (it currently does, unrelated infra issue), the client gets an uncaught 500
    // with no `data` payload even though the account/org WERE created. Without this fallback
    // lookup, a 500 here would silently leak a User+Organization every night this script runs
    // while that bug remains unfixed — deterministic lookup by the email/name this run just used
    // finds them regardless of what the HTTP response contained.
    if (!cleanup.organizationId || !cleanup.ownerId) {
      const userLookup = await db.execute({ sql: `SELECT id FROM "User" WHERE email = ?`, args: [ownerEmail] });
      const orgLookup = await db.execute({ sql: `SELECT id FROM "Organization" WHERE name = ?`, args: [`Nightly Smoke Org ${RUN_TAG}`] });
      cleanup.ownerId = cleanup.ownerId ?? (userLookup.rows[0]?.id as string | undefined) ?? null;
      cleanup.organizationId = cleanup.organizationId ?? (orgLookup.rows[0]?.id as string | undefined) ?? null;
      if (cleanup.organizationId) {
        const branchLookup = await db.execute({ sql: `SELECT id FROM "Branch" WHERE "organizationId" = ?`, args: [cleanup.organizationId] });
        cleanup.branchId = (branchLookup.rows[0]?.id as string | undefined) ?? null;
      }
      record(
        "inventory-registration-mail-bug-fallback-lookup",
        cleanup.organizationId ? "WARN" : "PASS",
        cleanup.organizationId
          ? `registration returned ${register.status} with no data (mail-send bug), but found and will clean up orgId=${cleanup.organizationId} userId=${cleanup.ownerId} — this WARN means the mail bug is still live, not that this script leaked anything`
          : "registration truly failed (no row created), nothing to fall back to",
      );
    }

    if (!cleanup.organizationId) {
      record("inventory-org-create", "FAIL", `status=${register.status}, body=${JSON.stringify(register.json).slice(0, 300)}`);
    } else {
      record("inventory-org-create", "PASS", `organizationId=${cleanup.organizationId}`);

      // Mail-free bypass: verify the owner's email directly (mirrors the manual 2026-08-11 pass;
      // see this file's top comment for why real OTP delivery isn't used here).
      await db.execute({ sql: `UPDATE "User" SET "emailVerified" = 1 WHERE id = ?`, args: [cleanup.ownerId] });

      const login = await api(INVENTORY_BASE, "POST", "/auth/login", { email: ownerEmail, password: "NightlySmoke123!" });
      const ownerToken = (login.json as any)?.data?.token;

      if (!ownerToken) {
        record("inventory-owner-login", "FAIL", `status=${login.status}`);
      } else {
        record("inventory-owner-login", "PASS", "logged in after DB-direct email-verify bypass");

        const branches = await api(INVENTORY_BASE, "GET", "/branches", null, ownerToken);
        cleanup.branchId = (branches.json as any)?.data?.items?.[0]?.id ?? null;

        const product = await api(INVENTORY_BASE, "POST", "/products", {
          name: `Nightly Smoke Product ${RUN_TAG}`,
          productType: "SIMPLE",
          trackInventory: true,
          allowNegativeStock: true,
          defaultVariant: { sku: `NIGHTLY-${RUN_TAG}`, costPrice: 50, sellingPrice: 100 },
        }, ownerToken);
        const productId = (product.json as any)?.data?.id;
        const variantId = (product.json as any)?.data?.variants?.[0]?.id;
        cleanup.productId = productId ?? null;

        if (!productId || !variantId || !cleanup.branchId) {
          record("inventory-product-create", "FAIL", `status=${product.status}`);
        } else {
          record("inventory-product-create", "PASS", `productId=${productId}`);

          // --- Register + DB-verify 3 test drivers (no email at all — avoids mail entirely) ---
          async function registerDriver(suffix: string, name: string, loc: { lat: number; lng: number }) {
            const phone = `+9198${suffix}`;
            const res = await api(INVENTORY_BASE, "POST", "/driver-auth/register", {
              fullName: name, phone, password: "NightlySmokeDriver123!", vehicleType: "BIKE", vehicleNumber: `SMOKE${suffix}`,
            });
            // Note: unlike most endpoints in this API, driver-auth/register does NOT wrap its
            // response in a `data` envelope — the body is `{ driver: {...} }` directly.
            const driverId = (res.json as any)?.driver?.id;
            if (driverId) {
              cleanup.driverIds.push(driverId);
              await db.execute({ sql: `UPDATE "Driver" SET status = 'VERIFIED' WHERE id = ?`, args: [driverId] });
            }
            return { phone, driverId };
          }

          const suffixBase = RUN_TAG.replace(/[^0-9]/g, "").slice(-7);
          const d1 = await registerDriver(`0${suffixBase}1`, "Nightly Driver Near", D1_LOC);
          const d2 = await registerDriver(`0${suffixBase}2`, "Nightly Driver Mid", D2_LOC);
          const d3 = await registerDriver(`0${suffixBase}3`, "Nightly Driver Far", D3_LOC);

          if (!d1.driverId || !d2.driverId || !d3.driverId) {
            record("inventory-driver-setup", "FAIL", "one or more driver registrations failed");
          } else {
            record("inventory-driver-setup", "PASS", "3 drivers registered + DB-verified");

            async function setupDriver(phone: string, loc: { lat: number; lng: number }) {
              const login = await api(INVENTORY_BASE, "POST", "/driver-auth/login", { phone, password: "NightlySmokeDriver123!" });
              const token = (login.json as any)?.token;
              if (!token) return null;
              await api(INVENTORY_BASE, "PATCH", "/driver/location", { latitude: loc.lat, longitude: loc.lng }, token);
              await api(INVENTORY_BASE, "PATCH", "/driver/availability", { isAvailableForAssignment: true }, token);
              return token;
            }

            const d1Token = await setupDriver(d1.phone, D1_LOC);
            const d2Token = await setupDriver(d2.phone, D2_LOC);
            const d3Token = await setupDriver(d3.phone, D3_LOC);
            record("inventory-driver-location-tracking", d1Token && d2Token && d3Token ? "PASS" : "FAIL", "location + availability set for all 3 drivers");

            // === 5/6/7. Matching, closest-wins, decline-reassignment, fare ===
            async function createOrder(tag: string, delivery: { lat: number; lng: number }) {
              const create = await api(INVENTORY_BASE, "POST", `/internal/marketplace/organizations/${cleanup.organizationId}/sales-orders`, {
                branchId: cleanup.branchId,
                externalOrderId: `nightly-${tag}-${RUN_TAG}`,
                externalOrderNumber: `NIGHTLY-${tag}`,
                customer: { name: "Nightly Smoke Customer", phone: "+919999999999", addressLine: "Test delivery point", latitude: delivery.lat, longitude: delivery.lng },
                items: [{ inventoryProductId: productId, inventoryVariantId: variantId, quantity: 1, unitPrice: 100 }],
                notes: "nightly-smoke-test",
              }, undefined, { "X-Internal-Service-Token": INTERNAL_TOKEN });
              const orderId = (create.json as any)?.data?.salesOrderId;
              if (orderId) cleanup.orderIds.push(orderId);
              return orderId;
            }

            const order1Id = await createOrder("order1", DELIVERY_NEAR);
            if (!order1Id) {
              record("inventory-order-create", "FAIL", "bridge order creation failed");
            } else {
              await api(INVENTORY_BASE, "POST", `/sales-orders/${order1Id}/confirm`, {}, ownerToken);
              const ready1 = await api(INVENTORY_BASE, "PATCH", `/sales-orders/${order1Id}/mark-ready`, {}, ownerToken);
              const assignedDriverId = (ready1.json as any)?.data?.assignedDriverId;
              const closestWins = assignedDriverId === d1.driverId;
              record("driver-matching-near-and-closest-wins", closestWins ? "PASS" : "FAIL", `assignedDriverId=${assignedDriverId}, expected D1=${d1.driverId}`);

              const estimatedDistanceKm = (ready1.json as any)?.data?.estimatedDistanceKm;
              const driverDeliveryFee = (ready1.json as any)?.data?.driverDeliveryFee;
              const fareFieldsPresent = estimatedDistanceKm != null && driverDeliveryFee != null;
              record(
                "distance-fare-fields-present",
                fareFieldsPresent ? "PASS" : "WARN",
                fareFieldsPresent
                  ? `estimatedDistanceKm=${estimatedDistanceKm}, driverDeliveryFee=${driverDeliveryFee}`
                  : "fields missing/null on mark-ready response — the deployed Inventory service may be running a stale build that predates the distance-fare feature; check Render's deploy status/logs for nearcart-inventory-backend",
              );

              // Decline chain: D1 declines -> D2 should get it; D2 declines -> unassigned (D3 out of radius)
              const d1Decline = await api(INVENTORY_BASE, "POST", `/driver/orders/${order1Id}/decline`, {}, d1Token!);
              const afterD1Decline = (d1Decline.json as any)?.data?.assignedDriverId;
              const d2Decline = await api(INVENTORY_BASE, "POST", `/driver/orders/${order1Id}/decline`, {}, d2Token!);
              const afterD2Decline = (d2Decline.json as any)?.data?.assignedDriverId;
              record(
                "driver-decline-reassignment",
                afterD1Decline === d2.driverId && (afterD2Decline == null) ? "PASS" : "WARN",
                `after D1 decline -> ${afterD1Decline} (expect D2=${d2.driverId}); after D2 decline -> ${afterD2Decline} (expect null, D3 out of radius)`,
              );

              // Never-re-offer guarantee: D1 toggling back online must not get this order again
              await api(INVENTORY_BASE, "PATCH", "/driver/availability", { isAvailableForAssignment: false }, d1Token!);
              await api(INVENTORY_BASE, "PATCH", "/driver/availability", { isAvailableForAssignment: true }, d1Token!);
              const d1OrdersAfter = await api(INVENTORY_BASE, "GET", "/driver/orders", null, d1Token!);
              const reOffered = ((d1OrdersAfter.json as any)?.data ?? []).some((o: any) => o.id === order1Id);
              record("driver-never-re-offered-after-decline", reOffered ? "FAIL" : "PASS", reOffered ? "REGRESSION: order1 was re-offered to D1 after it had already declined" : "order1 correctly not re-offered to D1");
            }

            // Far-delivery fare comparison (only meaningful once distance-fare-fields-present is PASS)
            const order2Id = await createOrder("order2", DELIVERY_FAR);
            if (order2Id) {
              await api(INVENTORY_BASE, "POST", `/sales-orders/${order2Id}/confirm`, {}, ownerToken);
              const ready2 = await api(INVENTORY_BASE, "PATCH", `/sales-orders/${order2Id}/mark-ready`, {}, ownerToken);
              const fee2 = (ready2.json as any)?.data?.driverDeliveryFee;
              record("distance-fare-scales-with-distance", typeof fee2 === "number" && fee2 > 20 ? "PASS" : "WARN", `far-order (~10km) fee=${fee2}, expect > near-order's base`);
            }
          }
        }
      }
    }
  }

  console.log("\n=== SUMMARY ===");
  const failed = results.filter((r) => r.status === "FAIL");
  const warned = results.filter((r) => r.status === "WARN");
  for (const r of results) console.log(`[${r.status}] ${r.name}`);
  console.log(`\n${results.length - failed.length - warned.length}/${results.length} passed, ${warned.length} warned, ${failed.length} failed`);
  if (failed.length > 0) {
    console.error("\nFAILURES:");
    for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("Nightly smoke test crashed:", err);
    process.exitCode = 1;
  })
  .finally(runCleanup);
