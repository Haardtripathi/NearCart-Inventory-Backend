-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ORDER_CANCEL';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_CANCEL_BRIDGE';

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "deliveryAddress" JSONB;

-- CreateIndex
CREATE INDEX "SalesOrder_branchId_status_idx" ON "SalesOrder"("branchId", "status");
