-- CreateTable
CREATE TABLE "EntityFieldTranslation" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityFieldTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntityFieldTranslation_entityType_entityId_fieldKey_language_key" ON "EntityFieldTranslation"("entityType", "entityId", "fieldKey", "language");

-- CreateIndex
CREATE INDEX "EntityFieldTranslation_entityType_entityId_idx" ON "EntityFieldTranslation"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityFieldTranslation_entityType_fieldKey_language_idx" ON "EntityFieldTranslation"("entityType", "fieldKey", "language");
