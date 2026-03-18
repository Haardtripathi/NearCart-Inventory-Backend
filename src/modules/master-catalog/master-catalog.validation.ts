import { ProductType, TrackMethod } from "@prisma/client";
import { z } from "zod";

import {
  decimalInputSchema,
  languageCodeSchema,
  optionalDecimalInputSchema,
  optionalTrimmedString,
  paginationQuerySchema,
  trimmedString,
  uniqueLanguageArraySchema,
} from "../../utils/validation";

const localizedNameSchema = z.object({
  language: languageCodeSchema,
  name: trimmedString,
});

const localizedNameDescriptionSchema = localizedNameSchema.extend({
  description: optionalTrimmedString,
});

const masterItemTranslationSchema = localizedNameDescriptionSchema.extend({
  shortName: optionalTrimmedString,
});

const aliasSchema = z.object({
  language: languageCodeSchema,
  value: trimmedString,
});

const pricingOverrideSchema = z.object({
  masterVariantTemplateId: optionalTrimmedString,
  sellingPrice: decimalInputSchema.optional(),
  costPrice: decimalInputSchema.optional(),
  mrp: decimalInputSchema.optional(),
});

const namingOverrideSchema = z.object({
  canonicalName: optionalTrimmedString,
});

const masterVariantTemplateSchema = z.object({
  code: trimmedString,
  name: trimmedString,
  skuSuffix: optionalTrimmedString,
  barcode: optionalTrimmedString,
  attributes: z.unknown().optional(),
  defaultCostPrice: optionalDecimalInputSchema,
  defaultSellingPrice: optionalDecimalInputSchema,
  defaultMrp: optionalDecimalInputSchema,
  reorderLevel: optionalDecimalInputSchema,
  minStockLevel: optionalDecimalInputSchema,
  maxStockLevel: optionalDecimalInputSchema,
  weight: optionalDecimalInputSchema,
  unitCode: optionalTrimmedString,
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  metadata: z.unknown().optional(),
  translations: uniqueLanguageArraySchema(localizedNameSchema).optional(),
});

export const masterCatalogCategoriesQuerySchema = paginationQuerySchema.extend({
  industryId: trimmedString,
  parentId: optionalTrimmedString,
  lang: optionalTrimmedString,
});

export const masterCatalogCategoryTreeQuerySchema = z.object({
  industryId: trimmedString,
  lang: optionalTrimmedString,
});

export const createMasterCatalogCategorySchema = z.object({
  industryId: trimmedString,
  parentId: optionalTrimmedString,
  code: trimmedString,
  slug: optionalTrimmedString,
  sortOrder: z.coerce.number().int().min(0).optional(),
  iconKey: optionalTrimmedString,
  imageUrl: optionalTrimmedString,
  isActive: z.boolean().optional(),
  metadata: z.unknown().optional(),
  translations: uniqueLanguageArraySchema(localizedNameDescriptionSchema),
});

export const updateMasterCatalogCategorySchema = createMasterCatalogCategorySchema.partial();

export const masterCatalogItemsQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  industryId: trimmedString,
  categoryId: optionalTrimmedString,
  q: optionalTrimmedString,
  lang: optionalTrimmedString,
  hasVariants: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const createMasterCatalogItemSchema = z.object({
  industryId: trimmedString,
  masterCategoryId: optionalTrimmedString,
  code: trimmedString,
  slug: optionalTrimmedString,
  canonicalName: trimmedString,
  canonicalDescription: optionalTrimmedString,
  productType: z.nativeEnum(ProductType),
  defaultTrackMethod: z.nativeEnum(TrackMethod),
  defaultUnitCode: optionalTrimmedString,
  defaultBrandName: optionalTrimmedString,
  defaultTaxCode: optionalTrimmedString,
  hasVariants: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
  allowBackorder: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
  defaultImageUrl: optionalTrimmedString,
  tags: z.unknown().optional(),
  customFieldsTemplate: z.unknown().optional(),
  metadata: z.unknown().optional(),
  isActive: z.boolean().optional(),
  translations: uniqueLanguageArraySchema(masterItemTranslationSchema).optional(),
  aliases: z.array(aliasSchema).optional(),
  variantTemplates: z.array(masterVariantTemplateSchema).optional(),
});

export const updateMasterCatalogItemSchema = createMasterCatalogItemSchema.partial();

export const importMasterCatalogItemSchema = z
  .object({
    organizationId: optionalTrimmedString,
    categoryMode: z.enum(["AUTO_CREATE", "USE_EXISTING"]),
    existingCategoryId: optionalTrimmedString,
    allowDuplicate: z.boolean().optional(),
    strictIndustryMatch: z.boolean().optional(),
    forceImport: z.boolean().optional(),
    pricingOverrides: z
      .object({
        variantPrices: z.array(pricingOverrideSchema).optional(),
      })
      .optional(),
    namingOverrides: namingOverrideSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.categoryMode === "USE_EXISTING" && !value.existingCategoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "existingCategoryId is required when categoryMode is USE_EXISTING",
        path: ["existingCategoryId"],
      });
    }
  });

export const importManyMasterCatalogItemsSchema = z
  .object({
    organizationId: optionalTrimmedString,
    categoryMode: z.enum(["AUTO_CREATE", "USE_EXISTING"]),
    existingCategoryId: optionalTrimmedString,
    allowDuplicate: z.boolean().optional(),
    strictIndustryMatch: z.boolean().optional(),
    forceImport: z.boolean().optional(),
    items: z
      .array(
        z.object({
          masterItemId: trimmedString,
          pricingOverrides: z
            .object({
              variantPrices: z.array(pricingOverrideSchema).optional(),
            })
            .optional(),
          namingOverrides: namingOverrideSchema.optional(),
        }),
      )
      .min(1),
  })
  .superRefine((value, ctx) => {
    if (value.categoryMode === "USE_EXISTING" && !value.existingCategoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "existingCategoryId is required when categoryMode is USE_EXISTING",
        path: ["existingCategoryId"],
      });
    }
  });

export const featuredMasterCatalogItemsQuerySchema = z.object({
  lang: optionalTrimmedString,
  limit: z.coerce.number().int().min(1).max(50).default(8),
});
