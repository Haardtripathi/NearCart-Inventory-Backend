-- ============================================================================================
-- MUST BE HAND-APPLIED TO THE LIVE TURSO DATABASE. NOTHING APPLIES THIS AUTOMATICALLY.
-- (`prisma migrate` / `db push` do not work against this project's libsql:// URL.)
--
--     turso db shell <database-name> < prisma/manual-ddl/2026-09-24-shop-drivers.sql
--
-- Shop-owned drivers (2026-09-24): Driver.shopBranchId/shopJoinedAt, SalesOrder.driverDispatchMode
-- and the DriverShopCode table. Purely additive — new nullable columns and a new table, no DROP,
-- no data change — so code already running against this database is unaffected. Apply BEFORE
-- deploying the backend that reads these columns.
--
-- ALTER TABLE ... ADD COLUMN is not idempotent in SQLite: a second run fails on the first ALTER
-- with "duplicate column name" and changes nothing. The CREATE statements are IF NOT EXISTS.
-- ============================================================================================

ALTER TABLE "Driver" ADD COLUMN "shopBranchId" TEXT REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Driver" ADD COLUMN "shopJoinedAt" DATETIME;
CREATE INDEX IF NOT EXISTS "Driver_shopBranchId_idx" ON "Driver"("shopBranchId");

ALTER TABLE "SalesOrder" ADD COLUMN "driverDispatchMode" TEXT;

CREATE TABLE IF NOT EXISTS "DriverShopCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "usedByDriverId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverShopCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DriverShopCode_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "DriverShopCode_code_key" ON "DriverShopCode"("code");
CREATE INDEX IF NOT EXISTS "DriverShopCode_branchId_idx" ON "DriverShopCode"("branchId");
