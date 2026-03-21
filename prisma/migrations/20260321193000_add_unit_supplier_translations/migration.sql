-- CreateTable
CREATE TABLE "UnitTranslation" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierTranslation" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnitTranslation_unitId_language_key" ON "UnitTranslation"("unitId", "language");

-- CreateIndex
CREATE INDEX "UnitTranslation_language_idx" ON "UnitTranslation"("language");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierTranslation_supplierId_language_key" ON "SupplierTranslation"("supplierId", "language");

-- CreateIndex
CREATE INDEX "SupplierTranslation_language_idx" ON "SupplierTranslation"("language");

-- AddForeignKey
ALTER TABLE "UnitTranslation" ADD CONSTRAINT "UnitTranslation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierTranslation" ADD CONSTRAINT "SupplierTranslation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
