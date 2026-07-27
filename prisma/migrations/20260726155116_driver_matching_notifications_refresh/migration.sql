-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "isAvailableForAssignment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastKnownLatitude" DOUBLE PRECISION,
ADD COLUMN     "lastKnownLongitude" DOUBLE PRECISION,
ADD COLUMN     "lastLocationAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "confirmationDeadlineAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DriverRefreshToken" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DriverRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverRefreshToken_tokenHash_key" ON "DriverRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DriverRefreshToken_driverId_idx" ON "DriverRefreshToken"("driverId");

-- CreateIndex
CREATE INDEX "DriverRefreshToken_expiresAt_idx" ON "DriverRefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "DeviceToken_ownerType_ownerId_idx" ON "DeviceToken"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_ownerType_ownerId_expoPushToken_key" ON "DeviceToken"("ownerType", "ownerId", "expoPushToken");

-- CreateIndex
CREATE INDEX "Driver_isAvailableForAssignment_idx" ON "Driver"("isAvailableForAssignment");

-- CreateIndex
CREATE INDEX "SalesOrder_status_confirmationDeadlineAt_idx" ON "SalesOrder"("status", "confirmationDeadlineAt");

-- AddForeignKey
ALTER TABLE "DriverRefreshToken" ADD CONSTRAINT "DriverRefreshToken_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
