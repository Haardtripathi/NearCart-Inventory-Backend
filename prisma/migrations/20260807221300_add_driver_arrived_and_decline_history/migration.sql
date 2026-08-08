-- AlterTable
-- Adds the two SalesOrder columns introduced in commit f1fbc1e ("Add driver-arrived-at-pickup,
-- fix double-decline bug, notify on stuck orders") whose schema.prisma change was never
-- accompanied by a migration file. Both are additive/nullable, so this is safe to apply to the
-- live Turso DB without any data loss or backfill.
ALTER TABLE "SalesOrder" ADD COLUMN "arrivedForPickupAt" DATETIME;
ALTER TABLE "SalesOrder" ADD COLUMN "declinedByDriverIds" TEXT;
