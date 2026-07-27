-- CreateEnum
CREATE TYPE "LanguageCode" AS ENUM ('EN', 'HI', 'GU');

-- CreateEnum
CREATE TYPE "ProductSourceType" AS ENUM ('MANUAL', 'MASTER_TEMPLATE');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "defaultLanguage" "LanguageCode" NOT NULL DEFAULT 'EN',
ADD COLUMN     "enabledLanguages" JSONB DEFAULT '["EN", "HI", "GU"]';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "masterCatalogItemId" TEXT,
ADD COLUMN     "sourceType" "ProductSourceType" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredLanguage" "LanguageCode" NOT NULL DEFAULT 'EN';

-- CreateTable
CREATE TABLE "IndustryTranslation" (
    "id" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustryTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryTranslation" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTranslation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantTranslation" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariantTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterCatalogCategory" (
    "id" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "iconKey" TEXT,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterCatalogCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterCatalogCategoryTranslation" (
    "id" TEXT NOT NULL,
    "masterCategoryId" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterCatalogCategoryTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterCatalogItem" (
    "id" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "masterCategoryId" TEXT,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "canonicalDescription" TEXT,
    "productType" "ProductType" NOT NULL,
    "defaultTrackMethod" "TrackMethod" NOT NULL,
    "defaultUnitCode" TEXT,
    "defaultBrandName" TEXT,
    "defaultTaxCode" TEXT,
    "hasVariants" BOOLEAN NOT NULL DEFAULT false,
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "allowBackorder" BOOLEAN NOT NULL DEFAULT false,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "defaultImageUrl" TEXT,
    "tags" JSONB,
    "customFieldsTemplate" JSONB,
    "metadata" JSONB,
    "searchText" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterCatalogItemTranslation" (
    "id" TEXT NOT NULL,
    "masterItemId" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterCatalogItemTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterCatalogItemAlias" (
    "id" TEXT NOT NULL,
    "masterItemId" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterCatalogItemAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterCatalogVariantTemplate" (
    "id" TEXT NOT NULL,
    "masterItemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "skuSuffix" TEXT,
    "barcode" TEXT,
    "attributes" JSONB,
    "defaultCostPrice" DECIMAL(18,4),
    "defaultSellingPrice" DECIMAL(18,4),
    "defaultMrp" DECIMAL(18,4),
    "reorderLevel" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "minStockLevel" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "maxStockLevel" DECIMAL(18,6),
    "weight" DECIMAL(18,6),
    "unitCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterCatalogVariantTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterCatalogVariantTranslation" (
    "id" TEXT NOT NULL,
    "masterVariantTemplateId" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterCatalogVariantTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IndustryTranslation_language_idx" ON "IndustryTranslation"("language");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryTranslation_industryId_language_key" ON "IndustryTranslation"("industryId", "language");

-- CreateIndex
CREATE INDEX "CategoryTranslation_language_idx" ON "CategoryTranslation"("language");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryTranslation_categoryId_language_key" ON "CategoryTranslation"("categoryId", "language");

-- CreateIndex
CREATE INDEX "ProductTranslation_language_idx" ON "ProductTranslation"("language");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTranslation_productId_language_key" ON "ProductTranslation"("productId", "language");

-- CreateIndex
CREATE INDEX "ProductVariantTranslation_language_idx" ON "ProductVariantTranslation"("language");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariantTranslation_variantId_language_key" ON "ProductVariantTranslation"("variantId", "language");

-- CreateIndex
CREATE INDEX "MasterCatalogCategory_industryId_parentId_idx" ON "MasterCatalogCategory"("industryId", "parentId");

-- CreateIndex
CREATE INDEX "MasterCatalogCategory_industryId_isActive_idx" ON "MasterCatalogCategory"("industryId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MasterCatalogCategory_industryId_code_key" ON "MasterCatalogCategory"("industryId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "MasterCatalogCategory_industryId_slug_key" ON "MasterCatalogCategory"("industryId", "slug");

-- CreateIndex
CREATE INDEX "MasterCatalogCategoryTranslation_language_idx" ON "MasterCatalogCategoryTranslation"("language");

-- CreateIndex
CREATE UNIQUE INDEX "MasterCatalogCategoryTranslation_masterCategoryId_language_key" ON "MasterCatalogCategoryTranslation"("masterCategoryId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "MasterCatalogItem_code_key" ON "MasterCatalogItem"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MasterCatalogItem_slug_key" ON "MasterCatalogItem"("slug");

-- CreateIndex
CREATE INDEX "MasterCatalogItem_industryId_masterCategoryId_idx" ON "MasterCatalogItem"("industryId", "masterCategoryId");

-- CreateIndex
CREATE INDEX "MasterCatalogItem_industryId_isActive_idx" ON "MasterCatalogItem"("industryId", "isActive");

-- CreateIndex
CREATE INDEX "MasterCatalogItemTranslation_language_idx" ON "MasterCatalogItemTranslation"("language");

-- CreateIndex
CREATE UNIQUE INDEX "MasterCatalogItemTranslation_masterItemId_language_key" ON "MasterCatalogItemTranslation"("masterItemId", "language");

-- CreateIndex
CREATE INDEX "MasterCatalogItemAlias_masterItemId_idx" ON "MasterCatalogItemAlias"("masterItemId");

-- CreateIndex
CREATE INDEX "MasterCatalogItemAlias_language_value_idx" ON "MasterCatalogItemAlias"("language", "value");

-- CreateIndex
CREATE INDEX "MasterCatalogVariantTemplate_masterItemId_isActive_idx" ON "MasterCatalogVariantTemplate"("masterItemId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MasterCatalogVariantTemplate_masterItemId_code_key" ON "MasterCatalogVariantTemplate"("masterItemId", "code");

-- CreateIndex
CREATE INDEX "MasterCatalogVariantTranslation_language_idx" ON "MasterCatalogVariantTranslation"("language");

-- CreateIndex
CREATE UNIQUE INDEX "MasterCatalogVariantTranslation_masterVariantTemplateId_lan_key" ON "MasterCatalogVariantTranslation"("masterVariantTemplateId", "language");

-- CreateIndex
CREATE INDEX "Product_organizationId_masterCatalogItemId_idx" ON "Product"("organizationId", "masterCatalogItemId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_masterCatalogItemId_fkey" FOREIGN KEY ("masterCatalogItemId") REFERENCES "MasterCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndustryTranslation" ADD CONSTRAINT "IndustryTranslation_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryTranslation" ADD CONSTRAINT "CategoryTranslation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTranslation" ADD CONSTRAINT "ProductTranslation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantTranslation" ADD CONSTRAINT "ProductVariantTranslation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCatalogCategory" ADD CONSTRAINT "MasterCatalogCategory_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCatalogCategory" ADD CONSTRAINT "MasterCatalogCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MasterCatalogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCatalogCategoryTranslation" ADD CONSTRAINT "MasterCatalogCategoryTranslation_masterCategoryId_fkey" FOREIGN KEY ("masterCategoryId") REFERENCES "MasterCatalogCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCatalogItem" ADD CONSTRAINT "MasterCatalogItem_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCatalogItem" ADD CONSTRAINT "MasterCatalogItem_masterCategoryId_fkey" FOREIGN KEY ("masterCategoryId") REFERENCES "MasterCatalogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCatalogItemTranslation" ADD CONSTRAINT "MasterCatalogItemTranslation_masterItemId_fkey" FOREIGN KEY ("masterItemId") REFERENCES "MasterCatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCatalogItemAlias" ADD CONSTRAINT "MasterCatalogItemAlias_masterItemId_fkey" FOREIGN KEY ("masterItemId") REFERENCES "MasterCatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCatalogVariantTemplate" ADD CONSTRAINT "MasterCatalogVariantTemplate_masterItemId_fkey" FOREIGN KEY ("masterItemId") REFERENCES "MasterCatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCatalogVariantTranslation" ADD CONSTRAINT "MasterCatalogVariantTranslation_masterVariantTemplateId_fkey" FOREIGN KEY ("masterVariantTemplateId") REFERENCES "MasterCatalogVariantTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
