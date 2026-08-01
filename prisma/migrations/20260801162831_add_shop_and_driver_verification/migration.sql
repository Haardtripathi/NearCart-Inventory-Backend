-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "latitude" REAL,
    "longitude" REAL,
    "shopPhotoUrl" TEXT,
    "shopPhotoVerificationStatus" TEXT NOT NULL DEFAULT 'NOT_UPLOADED',
    "shopPhotoClarityOk" BOOLEAN,
    "shopPhotoNameDetected" TEXT,
    "shopPhotoNameMatch" BOOLEAN,
    "shopPhotoPlaceLocationMatch" BOOLEAN,
    "shopPhotoMatchedPlaces" JSONB,
    "shopPhotoVerificationReasons" JSONB,
    "shopPhotoVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Branch" ("addressLine1", "addressLine2", "city", "code", "country", "createdAt", "deletedAt", "email", "id", "isActive", "latitude", "longitude", "name", "organizationId", "phone", "postalCode", "state", "type", "updatedAt") SELECT "addressLine1", "addressLine2", "city", "code", "country", "createdAt", "deletedAt", "email", "id", "isActive", "latitude", "longitude", "name", "organizationId", "phone", "postalCode", "state", "type", "updatedAt" FROM "Branch";
DROP TABLE "Branch";
ALTER TABLE "new_Branch" RENAME TO "Branch";
CREATE INDEX "Branch_organizationId_deletedAt_idx" ON "Branch"("organizationId", "deletedAt");
CREATE UNIQUE INDEX "Branch_organizationId_code_key" ON "Branch"("organizationId", "code");
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
    "vehiclePhotoUrl" TEXT,
    "vehiclePlateNumber" TEXT,
    "vehiclePlateVerified" BOOLEAN NOT NULL DEFAULT false,
    "vehiclePhotoClarityOk" BOOLEAN,
    "licensePhotoUrl" TEXT,
    "licenseNumber" TEXT,
    "licenseHolderName" TEXT,
    "licenseDob" TEXT,
    "licenseExpiry" TEXT,
    "licenseVerified" BOOLEAN NOT NULL DEFAULT false,
    "licenseMatchScore" REAL,
    "onboardingVerificationStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Driver" ("createdAt", "email", "emailVerified", "fullName", "id", "isAvailableForAssignment", "lastKnownLatitude", "lastKnownLongitude", "lastLocationAt", "passwordHash", "phone", "status", "updatedAt", "vehicleNumber", "vehicleType") SELECT "createdAt", "email", "emailVerified", "fullName", "id", "isAvailableForAssignment", "lastKnownLatitude", "lastKnownLongitude", "lastLocationAt", "passwordHash", "phone", "status", "updatedAt", "vehicleNumber", "vehicleType" FROM "Driver";
DROP TABLE "Driver";
ALTER TABLE "new_Driver" RENAME TO "Driver";
CREATE UNIQUE INDEX "Driver_phone_key" ON "Driver"("phone");
CREATE UNIQUE INDEX "Driver_email_key" ON "Driver"("email");
CREATE INDEX "Driver_status_idx" ON "Driver"("status");
CREATE INDEX "Driver_isAvailableForAssignment_idx" ON "Driver"("isAvailableForAssignment");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
