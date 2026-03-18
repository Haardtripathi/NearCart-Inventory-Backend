import {
  AuditAction,
  Prisma,
  ProductSourceType,
  ProductStatus,
  ProductType,
} from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { assertCategoryInOrg, assertOrganizationExists } from "../../utils/guards";
import type { LocaleContext } from "../../utils/localization";
import { toDecimal } from "../../utils/decimal";
import { toNullableJsonValue } from "../../utils/json";
import { slugify } from "../../utils/slug";
import type { DbClient } from "../../types/prisma";
import { createAuditLog } from "../audit/audit.service";
import { getProductById } from "../products/products.service";

const importMasterCatalogItemInclude = {
  category: {
    include: {
      translations: {
        orderBy: {
          language: "asc",
        },
      },
    },
  },
  translations: {
    orderBy: {
      language: "asc",
    },
  },
  variantTemplates: {
    include: {
      translations: {
        orderBy: {
          language: "asc",
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  },
  aliases: true,
} satisfies Prisma.MasterCatalogItemInclude;

type ImportMasterCatalogItemRecord = Prisma.MasterCatalogItemGetPayload<{
  include: typeof importMasterCatalogItemInclude;
}>;

interface ImportPricingOverride {
  masterVariantTemplateId?: string;
  sellingPrice?: Prisma.Decimal.Value;
  costPrice?: Prisma.Decimal.Value;
  mrp?: Prisma.Decimal.Value;
}

interface ImportMasterCatalogItemInput {
  organizationId?: string;
  categoryMode: "AUTO_CREATE" | "USE_EXISTING";
  existingCategoryId?: string;
  allowDuplicate?: boolean;
  strictIndustryMatch?: boolean;
  forceImport?: boolean;
  pricingOverrides?: {
    variantPrices?: ImportPricingOverride[];
  };
  namingOverrides?: {
    canonicalName?: string;
  };
}

function getCategoryCanonicalFields(category: NonNullable<ImportMasterCatalogItemRecord["category"]>) {
  const englishTranslation = category.translations.find((translation) => translation.language === "EN");
  const fallbackTranslation = englishTranslation ?? category.translations[0];

  return {
    name: fallbackTranslation?.name ?? category.code,
    description: fallbackTranslation?.description ?? null,
  };
}

async function resolveImportOrganizationId(activeOrganizationId: string, bodyOrganizationId?: string) {
  if (bodyOrganizationId && bodyOrganizationId !== activeOrganizationId) {
    throw ApiError.badRequest("organizationId must match the active organization context");
  }

  return activeOrganizationId;
}

async function getImportMasterCatalogItem(itemId: string) {
  const item = await prisma.masterCatalogItem.findUnique({
    where: {
      id: itemId,
    },
    include: importMasterCatalogItemInclude,
  });

  if (!item) {
    throw ApiError.notFound("Master catalog item not found");
  }

  if (!item.isActive) {
    throw ApiError.badRequest("Master catalog item is inactive");
  }

  return item;
}

async function resolveUnitByCode(db: DbClient, organizationId: string, unitCode?: string | null) {
  if (!unitCode) {
    return null;
  }

  const organizationUnit = await db.unit.findFirst({
    where: {
      organizationId,
      code: unitCode,
    },
  });

  if (organizationUnit) {
    return organizationUnit;
  }

  return db.unit.findFirst({
    where: {
      organizationId: null,
      isSystem: true,
      code: unitCode,
    },
  });
}

async function resolveTaxRateId(db: DbClient, organizationId: string, taxCode?: string | null) {
  if (!taxCode) {
    return null;
  }

  const taxRate = await db.taxRate.findFirst({
    where: {
      organizationId,
      code: taxCode,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  return taxRate?.id ?? null;
}

async function resolveBrandId(db: DbClient, organizationId: string, brandName?: string | null) {
  if (!brandName) {
    return null;
  }

  const slug = slugify(brandName);
  const existingBrand = await db.brand.findFirst({
    where: {
      organizationId,
      slug,
    },
  });

  if (existingBrand) {
    if (existingBrand.deletedAt) {
      const restored = await db.brand.update({
        where: {
          id: existingBrand.id,
        },
        data: {
          name: brandName.trim(),
          isActive: true,
          deletedAt: null,
        },
      });

      return restored.id;
    }

    return existingBrand.id;
  }

  const created = await db.brand.create({
    data: {
      organizationId,
      name: brandName.trim(),
      slug,
      isActive: true,
    },
  });

  return created.id;
}

async function syncCategoryTranslationsFromMaster(
  db: DbClient,
  categoryId: string,
  masterCategory: NonNullable<ImportMasterCatalogItemRecord["category"]>,
) {
  for (const translation of masterCategory.translations) {
    const existing = await db.categoryTranslation.findFirst({
      where: {
        categoryId,
        language: translation.language,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      await db.categoryTranslation.update({
        where: {
          id: existing.id,
        },
        data: {
          name: translation.name,
          description: translation.description,
        },
      });
      continue;
    }

    await db.categoryTranslation.create({
      data: {
        categoryId,
        language: translation.language,
        name: translation.name,
        description: translation.description,
      },
    });
  }
}

async function ensureImportCategory(
  db: DbClient,
  organizationId: string,
  input: ImportMasterCatalogItemInput,
  masterItem: ImportMasterCatalogItemRecord,
) {
  if (input.categoryMode === "USE_EXISTING") {
    await assertCategoryInOrg(db, organizationId, input.existingCategoryId!);
    return input.existingCategoryId!;
  }

  if (!masterItem.category) {
    return null;
  }

  const canonicalFields = getCategoryCanonicalFields(masterItem.category);
  const existingCategory = await db.category.findFirst({
    where: {
      organizationId,
      slug: masterItem.category.slug,
    },
  });

  if (existingCategory) {
    const restoredCategory = existingCategory.deletedAt
      ? await db.category.update({
          where: {
            id: existingCategory.id,
          },
          data: {
            name: canonicalFields.name,
            description: canonicalFields.description,
            isActive: true,
            deletedAt: null,
            customFields: toNullableJsonValue({
              masterCatalogCategoryId: masterItem.category.id,
              importedFromMasterCatalog: true,
            }),
          },
        })
      : existingCategory;

    await syncCategoryTranslationsFromMaster(db, restoredCategory.id, masterItem.category);
    return restoredCategory.id;
  }

  const createdCategory = await db.category.create({
    data: {
      organizationId,
      name: canonicalFields.name,
      slug: masterItem.category.slug,
      description: canonicalFields.description,
      isActive: true,
      sortOrder: masterItem.category.sortOrder,
      customFields: toNullableJsonValue({
        masterCatalogCategoryId: masterItem.category.id,
        importedFromMasterCatalog: true,
      }),
    },
  });

  await syncCategoryTranslationsFromMaster(db, createdCategory.id, masterItem.category);
  return createdCategory.id;
}

async function generateUniqueProductSlug(db: DbClient, organizationId: string, baseName: string) {
  const baseSlug = slugify(baseName);
  let candidate = baseSlug;
  let index = 2;

  while (true) {
    const existing = await db.product.findFirst({
      where: {
        organizationId,
        slug: candidate,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return candidate;
    }

    candidate = `${baseSlug}-${index}`;
    index += 1;
  }
}

async function generateUniqueVariantSku(db: DbClient, organizationId: string, baseSku: string) {
  const normalizedBaseSku = baseSku.trim().toUpperCase();
  let candidate = normalizedBaseSku;
  let index = 2;

  while (true) {
    const existing = await db.productVariant.findFirst({
      where: {
        organizationId,
        sku: candidate,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return candidate;
    }

    candidate = `${normalizedBaseSku}-${index}`;
    index += 1;
  }
}

async function resolveAvailableBarcode(db: DbClient, organizationId: string, barcode?: string | null) {
  if (!barcode) {
    return null;
  }

  const existing = await db.productVariant.findFirst({
    where: {
      organizationId,
      barcode,
    },
    select: {
      id: true,
    },
  });

  return existing ? null : barcode;
}

function getVariantPriceOverride(
  pricingOverrides: ImportMasterCatalogItemInput["pricingOverrides"],
  masterVariantTemplateId?: string,
) {
  return pricingOverrides?.variantPrices?.find((price) =>
    masterVariantTemplateId ? price.masterVariantTemplateId === masterVariantTemplateId : !price.masterVariantTemplateId,
  );
}

async function validateIndustryCompatibility(
  organizationId: string,
  masterItem: ImportMasterCatalogItemRecord,
  input: ImportMasterCatalogItemInput,
) {
  const compatibleIndustry = await prisma.organizationIndustryConfig.findFirst({
    where: {
      organizationId,
      industryId: masterItem.industryId,
    },
    select: {
      id: true,
    },
  });

  const strictIndustryMatch = input.strictIndustryMatch ?? true;

  if (compatibleIndustry) {
    return null;
  }

  if (input.forceImport) {
    return "Industry mismatch allowed by forceImport";
  }

  if (strictIndustryMatch) {
    throw ApiError.badRequest("Master catalog item industry is not enabled for this organization");
  }

  return "Industry mismatch allowed because strictIndustryMatch is disabled";
}

async function createProductTranslations(
  db: DbClient,
  productId: string,
  masterItem: ImportMasterCatalogItemRecord,
) {
  for (const translation of masterItem.translations) {
    await db.productTranslation.create({
      data: {
        productId,
        language: translation.language,
        name: translation.name,
        description: translation.description,
      },
    });
  }
}

async function createVariantTranslations(
  db: DbClient,
  variantId: string,
  translations: Array<{ language: string; name: string }>,
) {
  for (const translation of translations) {
    await db.productVariantTranslation.create({
      data: {
        variantId,
        language: translation.language as never,
        name: translation.name,
      },
    });
  }
}

function normalizeTemplateDefaultFlags(templates: ImportMasterCatalogItemRecord["variantTemplates"]) {
  const preferredDefaultId = templates.find((template) => template.isDefault)?.id ?? templates[0]?.id ?? null;
  return templates.map((template) => ({
    ...template,
    isDefault: template.id === preferredDefaultId,
  }));
}

async function createImportedVariants(
  db: DbClient,
  organizationId: string,
  productId: string,
  productName: string,
  masterItem: ImportMasterCatalogItemRecord,
  primaryUnitId: string | null,
  pricingOverrides: ImportMasterCatalogItemInput["pricingOverrides"],
) {
  if (masterItem.variantTemplates.length === 0) {
    const priceOverride = getVariantPriceOverride(pricingOverrides);
    const sku = await generateUniqueVariantSku(db, organizationId, masterItem.code);

    const variant = await db.productVariant.create({
      data: {
        organizationId,
        productId,
        name: productName,
        sku,
        barcode: null,
        attributes: undefined,
        costPrice:
          priceOverride?.costPrice !== undefined ? toDecimal(priceOverride.costPrice) : new Prisma.Decimal(0),
        sellingPrice:
          priceOverride?.sellingPrice !== undefined ? toDecimal(priceOverride.sellingPrice) : new Prisma.Decimal(0),
        mrp: priceOverride?.mrp !== undefined ? toDecimal(priceOverride.mrp) : null,
        reorderLevel: new Prisma.Decimal(0),
        minStockLevel: new Prisma.Decimal(0),
        maxStockLevel: null,
        weight: null,
        unitId: primaryUnitId,
        isDefault: true,
        isActive: true,
        imageUrl: masterItem.defaultImageUrl,
        customFields: undefined,
        metadata: undefined,
      },
    });

    await createVariantTranslations(
      db,
      variant.id,
      masterItem.translations.map((translation) => ({
        language: translation.language,
        name: translation.name,
      })),
    );

    return;
  }

  const templates = normalizeTemplateDefaultFlags(masterItem.variantTemplates);

  for (const template of templates) {
    const priceOverride = getVariantPriceOverride(pricingOverrides, template.id);
    const templateUnit = await resolveUnitByCode(db, organizationId, template.unitCode ?? masterItem.defaultUnitCode);
    const skuBase = [masterItem.code, template.skuSuffix ?? template.code]
      .filter(Boolean)
      .map((part) => String(part).trim().toUpperCase())
      .join("-");
    const sku = await generateUniqueVariantSku(db, organizationId, skuBase);
    const barcode = await resolveAvailableBarcode(db, organizationId, template.barcode);

    const variant = await db.productVariant.create({
      data: {
        organizationId,
        productId,
        name: template.name,
        sku,
        barcode,
        attributes: toNullableJsonValue(template.attributes),
        costPrice:
          priceOverride?.costPrice !== undefined
            ? toDecimal(priceOverride.costPrice)
            : template.defaultCostPrice ?? new Prisma.Decimal(0),
        sellingPrice:
          priceOverride?.sellingPrice !== undefined
            ? toDecimal(priceOverride.sellingPrice)
            : template.defaultSellingPrice ?? new Prisma.Decimal(0),
        mrp: priceOverride?.mrp !== undefined ? toDecimal(priceOverride.mrp) : template.defaultMrp,
        reorderLevel: template.reorderLevel,
        minStockLevel: template.minStockLevel,
        maxStockLevel: template.maxStockLevel,
        weight: template.weight,
        unitId: templateUnit?.id ?? primaryUnitId,
        isDefault: template.isDefault,
        isActive: template.isActive,
        imageUrl: masterItem.defaultImageUrl,
        customFields: undefined,
        metadata: toNullableJsonValue({
          masterCatalogVariantTemplateId: template.id,
        }),
      },
    });

    await createVariantTranslations(
      db,
      variant.id,
      template.translations.map((translation) => ({
        language: translation.language,
        name: translation.name,
      })),
    );
  }
}

export async function importMasterCatalogItem(
  masterItemId: string,
  actorUserId: string,
  activeOrganizationId: string,
  input: ImportMasterCatalogItemInput,
  localeContext: LocaleContext,
) {
  const organizationId = await resolveImportOrganizationId(activeOrganizationId, input.organizationId);
  await assertOrganizationExists(prisma, organizationId);

  if (input.existingCategoryId) {
    await assertCategoryInOrg(prisma, organizationId, input.existingCategoryId);
  }

  const masterItem = await getImportMasterCatalogItem(masterItemId);
  const industryWarning = await validateIndustryCompatibility(organizationId, masterItem, input);

  const existingProduct = await prisma.product.findFirst({
    where: {
      organizationId,
      masterCatalogItemId: masterItemId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (existingProduct && !input.allowDuplicate) {
    await createAuditLog(prisma, {
      organizationId,
      actorUserId,
      action: AuditAction.CREATE,
      entityType: "MasterCatalogItemImport",
      entityId: masterItemId,
      meta: {
        returnedExistingProductId: existingProduct.id,
        industryWarning,
      },
    });

    return {
      alreadyExisted: true,
      warning: industryWarning,
      product: await getProductById(organizationId, existingProduct.id, localeContext),
    };
  }

  const product = await prisma.$transaction(async (tx) => {
    const categoryId = await ensureImportCategory(tx, organizationId, input, masterItem);
    const primaryUnit = await resolveUnitByCode(tx, organizationId, masterItem.defaultUnitCode);
    const brandId = await resolveBrandId(tx, organizationId, masterItem.defaultBrandName);
    const taxRateId = await resolveTaxRateId(tx, organizationId, masterItem.defaultTaxCode);
    const productName = input.namingOverrides?.canonicalName?.trim() || masterItem.canonicalName;
    const slug = await generateUniqueProductSlug(tx, organizationId, productName);
    const productType =
      masterItem.variantTemplates.length > 0 || masterItem.hasVariants ? ProductType.VARIABLE : masterItem.productType;

    const createdProduct = await tx.product.create({
      data: {
        organizationId,
        categoryId,
        brandId,
        taxRateId,
        industryId: masterItem.industryId,
        masterCatalogItemId: masterItem.id,
        name: productName,
        slug,
        description: masterItem.canonicalDescription,
        productType,
        sourceType: ProductSourceType.MASTER_TEMPLATE,
        status: ProductStatus.ACTIVE,
        hasVariants: masterItem.variantTemplates.length > 0 || masterItem.hasVariants,
        trackInventory: masterItem.trackInventory,
        allowBackorder: masterItem.allowBackorder,
        allowNegativeStock: masterItem.allowNegativeStock,
        trackMethod: masterItem.defaultTrackMethod,
        primaryUnitId: primaryUnit?.id ?? null,
        imageUrl: masterItem.defaultImageUrl,
        tags: toNullableJsonValue(masterItem.tags),
        customFields: toNullableJsonValue(masterItem.customFieldsTemplate),
        metadata: toNullableJsonValue({
          importedFromMasterCatalog: true,
          masterCatalogItemId: masterItem.id,
          industryWarning,
        }),
        createdById: actorUserId,
        updatedById: actorUserId,
      },
    });

    await createProductTranslations(tx, createdProduct.id, masterItem);
    await createImportedVariants(
      tx,
      organizationId,
      createdProduct.id,
      productName,
      masterItem,
      primaryUnit?.id ?? null,
      input.pricingOverrides,
    );

    return createdProduct;
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "MasterCatalogItemImport",
    entityId: masterItemId,
    meta: {
      importedProductId: product.id,
      categoryMode: input.categoryMode,
      forceImport: input.forceImport ?? false,
      industryWarning,
    },
  });

  return {
    alreadyExisted: false,
    warning: industryWarning,
    product: await getProductById(organizationId, product.id, localeContext),
  };
}

export async function importManyMasterCatalogItems(
  actorUserId: string,
  activeOrganizationId: string,
  input: {
    organizationId?: string;
    categoryMode: "AUTO_CREATE" | "USE_EXISTING";
    existingCategoryId?: string;
    allowDuplicate?: boolean;
    strictIndustryMatch?: boolean;
    forceImport?: boolean;
    items: Array<{
      masterItemId: string;
      pricingOverrides?: ImportMasterCatalogItemInput["pricingOverrides"];
      namingOverrides?: ImportMasterCatalogItemInput["namingOverrides"];
    }>;
  },
  localeContext: LocaleContext,
) {
  const results = [];

  for (const item of input.items) {
    const result = await importMasterCatalogItem(
      item.masterItemId,
      actorUserId,
      activeOrganizationId,
      {
        organizationId: input.organizationId,
        categoryMode: input.categoryMode,
        existingCategoryId: input.existingCategoryId,
        allowDuplicate: input.allowDuplicate,
        strictIndustryMatch: input.strictIndustryMatch,
        forceImport: input.forceImport,
        pricingOverrides: item.pricingOverrides,
        namingOverrides: item.namingOverrides,
      },
      localeContext,
    );

    results.push({
      masterItemId: item.masterItemId,
      ...result,
    });
  }

  return {
    items: results,
  };
}
