-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Driver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isAvailableForAssignment" BOOLEAN NOT NULL DEFAULT false,
    "lastKnownLatitude" REAL,
    "lastKnownLongitude" REAL,
    "lastLocationAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Driver" ("createdAt", "email", "fullName", "id", "isAvailableForAssignment", "lastKnownLatitude", "lastKnownLongitude", "lastLocationAt", "passwordHash", "phone", "status", "updatedAt", "vehicleNumber", "vehicleType") SELECT "createdAt", "email", "fullName", "id", "isAvailableForAssignment", "lastKnownLatitude", "lastKnownLongitude", "lastLocationAt", "passwordHash", "phone", "status", "updatedAt", "vehicleNumber", "vehicleType" FROM "Driver";
DROP TABLE "Driver";
ALTER TABLE "new_Driver" RENAME TO "Driver";
CREATE UNIQUE INDEX "Driver_phone_key" ON "Driver"("phone");
CREATE UNIQUE INDEX "Driver_email_key" ON "Driver"("email");
CREATE INDEX "Driver_status_idx" ON "Driver"("status");
CREATE INDEX "Driver_isAvailableForAssignment_idx" ON "Driver"("isAvailableForAssignment");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
