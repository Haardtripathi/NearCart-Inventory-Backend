import { ProductType, TrackMethod } from "@prisma/client";
import { z } from "zod";

import {
  decimalInputSchema,
  languageCodeSchema,
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

const nonNegativeDecimalInputSchema = decimalInputSchema.refine(
  (value) => Number(value) >= 0,
  { message: "Value must not be negative" },
);

const optionalNonNegativeDecimalInputSchema = nonNegativeDecimalInputSchema.optional();

const pricingOverrideSchema = z.object({
  masterVariantTemplateId: optionalTrimmedString,
  sellingPrice: optionalNonNegativeDecimalInputSchema,
  costPrice: optionalNonNegativeDecimalInputSchema,
  mrp: optionalNonNegativeDecimalInputSchema,
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
  defaultCostPrice: optionalNonNegativeDecimalInputSchema,
  defaultSellingPrice: optionalNonNegativeDecimalInputSchema,
  defaultMrp: optionalNonNegativeDecimalInputSchema,
  reorderLevel: optionalNonNegativeDecimalInputSchema,
  minStockLevel: optionalNonNegativeDecimalInputSchema,
  maxStockLevel: optionalNonNegativeDecimalInputSchema,
  weight: optionalNonNegativeDecimalInputSchema,
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
  search: optionalTrimmedString,
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

// NOTE: `z.coerce.boolean()` is a footgun for query params: `Boolean("false")` is `true` in
// JS because it only checks for a non-empty string, so `?isActive=false` was silently coerced
// to `true` and the "inactive only" / "single variant" filters on this list endpoint were
// unusable (they behaved identically to their `true` counterpart). Parse the literal string
// instead.
const booleanQueryParamSchema = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .transform((value) => value === true || value === "true");

export const masterCatalogItemsQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  industryId: trimmedString,
  categoryId: optionalTrimmedString,
  q: optionalTrimmedString,
  lang: optionalTrimmedString,
  hasVariants: booleanQueryParamSchema.optional(),
  isActive: booleanQueryParamSchema.optional(),
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
    defaultVariantTemplateId: optionalTrimmedString,
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
          defaultVariantTemplateId: optionalTrimmedString,
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
