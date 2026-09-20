-- ============================================================================================
-- MUST BE HAND-APPLIED TO THE LIVE TURSO DATABASE. NOTHING APPLIES THIS AUTOMATICALLY.
--
-- `prisma migrate dev` / `prisma migrate deploy` / `prisma db push` DO NOT WORK against this
-- project's `libsql://` DATABASE_URL — a documented, repeatedly-hit hazard in this repo. The
-- matching `@@index` entries have been added to prisma/schema.prisma so the schema file stays the
-- source of truth and `prisma generate` keeps working, but the live database will NOT get these
-- indexes until someone runs this file against it by hand, e.g.:
--
--     turso db shell <database-name> < prisma/manual-ddl/2026-09-20-perf-indexes.sql
--
-- Every statement is CREATE INDEX IF NOT EXISTS, so re-running it is safe and does nothing the
-- second time. There are no destructive statements here: no DROP, no ALTER, no data change. The
-- index names match what Prisma itself generates (`<Table>_<col>_<col>_idx`) so a future
-- `prisma migrate diff` does not see these as drift and try to recreate them.
--
-- Building an index locks the table for the duration of the build. On a large InventoryLedger this
-- is the slow one — run it in a quiet window.
--
-- Added 2026-09-20 alongside the marketplace-bridge performance work.
-- ============================================================================================


-- --------------------------------------------------------------------------------------------
-- InventoryLedger — the append-only stock movement log, the table most likely to reach millions
-- of rows. Every read (inventory.service.ts listLedger) filters on organizationId and orders by
-- createdAt DESC, optionally narrowed to one branch or one variant. The pre-existing indexes are
-- all single-column, so the planner could use one for the filter or one for the sort but never
-- both: it read every row belonging to the organization and sorted them, just to return one page.
-- That cost grows every month the log grows. These cover filter + sort together.
-- --------------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "InventoryLedger_organizationId_createdAt_idx"
  ON "InventoryLedger" ("organizationId", "createdAt");

CREATE INDEX IF NOT EXISTS "InventoryLedger_organizationId_branchId_createdAt_idx"
  ON "InventoryLedger" ("organizationId", "branchId", "createdAt");

CREATE INDEX IF NOT EXISTS "InventoryLedger_organizationId_variantId_createdAt_idx"
  ON "InventoryLedger" ("organizationId", "variantId", "createdAt");


-- --------------------------------------------------------------------------------------------
-- SalesOrder — the other table that grows forever.
-- --------------------------------------------------------------------------------------------

-- Date-windowed reads: the analytics dashboard's "last 7 / last 30 days" figures, and any
-- createdAt-ordered order list. The existing [organizationId, status] index cannot serve a date
-- range, so these scanned every order the shop had ever taken.
CREATE INDEX IF NOT EXISTS "SalesOrder_organizationId_createdAt_idx"
  ON "SalesOrder" ("organizationId", "createdAt");

-- The driver-assignment watchdog (jobs/driver-assignment-watchdog.ts) runs every two minutes,
-- forever: it looks for READY orders whose assignedAt has aged past the staleness threshold, and
-- on the same tick sends near-timeout reminders over a narrower assignedAt window. Without
-- assignedAt in the index both re-scan every READY row on every tick, for the life of the system.
CREATE INDEX IF NOT EXISTS "SalesOrder_status_assignedAt_idx"
  ON "SalesOrder" ("status", "assignedAt");

-- findNearestUnassignedOrderForDriver (sales-orders.service.ts) runs whenever a driver comes
-- online: READY orders with no assigned driver, capped by age.
CREATE INDEX IF NOT EXISTS "SalesOrder_status_assignedDriverId_createdAt_idx"
  ON "SalesOrder" ("status", "assignedDriverId", "createdAt");

-- NOTE: the order-confirmation sweep's own predicate (status = PENDING AND confirmationDeadlineAt
-- < now) is ALREADY covered by the existing SalesOrder_status_confirmationDeadlineAt_idx. Nothing
-- to add for it — it was checked, not overlooked.


-- --------------------------------------------------------------------------------------------
-- SalesOrderItem — sales-velocity reads start from "which variants sold recently", which is a
-- lookup by variant/product across order items rather than by parent order. Only [salesOrderId]
-- existed.
-- --------------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "SalesOrderItem_variantId_idx"
  ON "SalesOrderItem" ("variantId");

CREATE INDEX IF NOT EXISTS "SalesOrderItem_productId_idx"
  ON "SalesOrderItem" ("productId");


-- --------------------------------------------------------------------------------------------
-- Product — storefront browsing is overwhelmingly "active products in this category / of this
-- brand". [organizationId, status] left the category/brand predicate to a scan of every active
-- product in the shop.
-- --------------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Product_organizationId_status_categoryId_idx"
  ON "Product" ("organizationId", "status", "categoryId");

CREATE INDEX IF NOT EXISTS "Product_organizationId_status_brandId_idx"
  ON "Product" ("organizationId", "status", "brandId");


-- --------------------------------------------------------------------------------------------
-- Customer — every order bridged in from NearCart resolves its customer by organizationId +
-- phone (marketplace.service.ts findOrCreateBridgeCustomer). Phone was unindexed, so that lookup
-- scanned every customer the shop has ever had, on the order-creation path.
-- --------------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Customer_organizationId_phone_idx"
  ON "Customer" ("organizationId", "phone");


-- --------------------------------------------------------------------------------------------
-- Driver — findNearestFreeDriver (sales-orders.service.ts) runs on every mark-ready and selects
-- on verification status + availability + location freshness together. The existing single-column
-- [status] and [isAvailableForAssignment] indexes can each narrow only one of those.
--
-- This index makes that query cheaper but does NOT make it scale: it still loads every matching
-- driver and filters by distance in JavaScript, with no geographic predicate in SQL. See the
-- accompanying report — fixing that properly means a bounding-box WHERE on
-- lastKnownLatitude/lastKnownLongitude, which lives in a file that was off-limits for this pass.
-- --------------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Driver_status_isAvailableForAssignment_lastLocationAt_idx"
  ON "Driver" ("status", "isAvailableForAssignment", "lastLocationAt");


-- Refresh the planner's statistics so it actually chooses the new indexes rather than the plan it
-- had already settled on. Cheap, non-destructive, and easy to forget.
ANALYZE;
