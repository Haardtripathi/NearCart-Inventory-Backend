-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ORDER_ASSIGN_DRIVER';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_PICKUP';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'DRIVER';

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedDriverId" TEXT,
ADD COLUMN     "externalOrderId" TEXT,
ADD COLUMN     "externalOrderNumber" TEXT,
ADD COLUMN     "pickedUpAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Grandfather in every user who has already completed a real credential flow (password set via
-- bootstrap-super-admin, self-registration, or an emailed ACCOUNT_SETUP/PASSWORD_RESET link) as
-- email-verified, so this migration does not lock any existing account out of login. Only newly
-- self-registered organization owners going forward start out unverified — see
-- auth.service.ts login()/registerOrganizationOwner().
UPDATE "User" SET "emailVerified" = true WHERE "passwordHash" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_externalOrderId_key" ON "SalesOrder"("externalOrderId");

-- CreateIndex
CREATE INDEX "SalesOrder_assignedDriverId_status_idx" ON "SalesOrder"("assignedDriverId", "status");

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
