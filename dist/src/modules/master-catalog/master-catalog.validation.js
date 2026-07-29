"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.featuredMasterCatalogItemsQuerySchema = exports.importManyMasterCatalogItemsSchema = exports.importMasterCatalogItemSchema = exports.updateMasterCatalogItemSchema = exports.createMasterCatalogItemSchema = exports.masterCatalogItemsQuerySchema = exports.updateMasterCatalogCategorySchema = exports.createMasterCatalogCategorySchema = exports.masterCatalogCategoryTreeQuerySchema = exports.masterCatalogCategoriesQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
const localizedNameSchema = zod_1.z.object({
    language: validation_1.languageCodeSchema,
    name: validation_1.trimmedString,
});
const localizedNameDescriptionSchema = localizedNameSchema.extend({
    description: validation_1.optionalTrimmedString,
});
const masterItemTranslationSchema = localizedNameDescriptionSchema.extend({
    shortName: validation_1.optionalTrimmedString,
});
const aliasSchema = zod_1.z.object({
    language: validation_1.languageCodeSchema,
    value: validation_1.trimmedString,
});
const nonNegativeDecimalInputSchema = validation_1.decimalInputSchema.refine((value) => Number(value) >= 0, { message: "Value must not be negative" });
const optionalNonNegativeDecimalInputSchema = nonNegativeDecimalInputSchema.optional();
const pricingOverrideSchema = zod_1.z.object({
    masterVariantTemplateId: validation_1.optionalTrimmedString,
    sellingPrice: optionalNonNegativeDecimalInputSchema,
    costPrice: optionalNonNegativeDecimalInputSchema,
    mrp: optionalNonNegativeDecimalInputSchema,
});
const namingOverrideSchema = zod_1.z.object({
    canonicalName: validation_1.optionalTrimmedString,
});
const masterVariantTemplateSchema = zod_1.z.object({
    code: validation_1.trimmedString,
    name: validation_1.trimmedString,
    skuSuffix: validation_1.optionalTrimmedString,
    barcode: validation_1.optionalTrimmedString,
    attributes: zod_1.z.unknown().optional(),
    defaultCostPrice: optionalNonNegativeDecimalInputSchema,
    defaultSellingPrice: optionalNonNegativeDecimalInputSchema,
    defaultMrp: optionalNonNegativeDecimalInputSchema,
    reorderLevel: optionalNonNegativeDecimalInputSchema,
    minStockLevel: optionalNonNegativeDecimalInputSchema,
    maxStockLevel: optionalNonNegativeDecimalInputSchema,
    weight: optionalNonNegativeDecimalInputSchema,
    unitCode: validation_1.optionalTrimmedString,
    isDefault: zod_1.z.boolean().optional(),
    isActive: zod_1.z.boolean().optional(),
    sortOrder: zod_1.z.coerce.number().int().min(0).optional(),
    metadata: zod_1.z.unknown().optional(),
    translations: (0, validation_1.uniqueLanguageArraySchema)(localizedNameSchema).optional(),
});
exports.masterCatalogCategoriesQuerySchema = validation_1.paginationQuerySchema.extend({
    industryId: validation_1.trimmedString,
    parentId: validation_1.optionalTrimmedString,
    search: validation_1.optionalTrimmedString,
    lang: validation_1.optionalTrimmedString,
});
exports.masterCatalogCategoryTreeQuerySchema = zod_1.z.object({
    industryId: validation_1.trimmedString,
    lang: validation_1.optionalTrimmedString,
});
exports.createMasterCatalogCategorySchema = zod_1.z.object({
    industryId: validation_1.trimmedString,
    parentId: validation_1.optionalTrimmedString,
    code: validation_1.trimmedString,
    slug: validation_1.optionalTrimmedString,
    sortOrder: zod_1.z.coerce.number().int().min(0).optional(),
    iconKey: validation_1.optionalTrimmedString,
    imageUrl: validation_1.optionalTrimmedString,
    isActive: zod_1.z.boolean().optional(),
    metadata: zod_1.z.unknown().optional(),
    translations: (0, validation_1.uniqueLanguageArraySchema)(localizedNameDescriptionSchema),
});
exports.updateMasterCatalogCategorySchema = exports.createMasterCatalogCategorySchema.partial();
// NOTE: `z.coerce.boolean()` is a footgun for query params: `Boolean("false")` is `true` in
// JS because it only checks for a non-empty string, so `?isActive=false` was silently coerced
// to `true` and the "inactive only" / "single variant" filters on this list endpoint were
// unusable (they behaved identically to their `true` counterpart). Parse the literal string
// instead.
const booleanQueryParamSchema = zod_1.z
    .union([zod_1.z.literal("true"), zod_1.z.literal("false"), zod_1.z.boolean()])
    .transform((value) => value === true || value === "true");
exports.masterCatalogItemsQuerySchema = validation_1.paginationQuerySchema.omit({ search: true }).extend({
    industryId: validation_1.trimmedString,
    categoryId: validation_1.optionalTrimmedString,
    q: validation_1.optionalTrimmedString,
    lang: validation_1.optionalTrimmedString,
    hasVariants: booleanQueryParamSchema.optional(),
    isActive: booleanQueryParamSchema.optional(),
});
exports.createMasterCatalogItemSchema = zod_1.z.object({
    industryId: validation_1.trimmedString,
    masterCategoryId: validation_1.optionalTrimmedString,
    code: validation_1.trimmedString,
    slug: validation_1.optionalTrimmedString,
    canonicalName: validation_1.trimmedString,
    canonicalDescription: validation_1.optionalTrimmedString,
    productType: zod_1.z.nativeEnum(client_1.ProductType),
    defaultTrackMethod: zod_1.z.nativeEnum(client_1.TrackMethod),
    defaultUnitCode: validation_1.optionalTrimmedString,
    defaultBrandName: validation_1.optionalTrimmedString,
    defaultTaxCode: validation_1.optionalTrimmedString,
    hasVariants: zod_1.z.boolean().optional(),
    trackInventory: zod_1.z.boolean().optional(),
    allowBackorder: zod_1.z.boolean().optional(),
    allowNegativeStock: zod_1.z.boolean().optional(),
    defaultImageUrl: validation_1.optionalTrimmedString,
    tags: zod_1.z.unknown().optional(),
    customFieldsTemplate: zod_1.z.unknown().optional(),
    metadata: zod_1.z.unknown().optional(),
    isActive: zod_1.z.boolean().optional(),
    translations: (0, validation_1.uniqueLanguageArraySchema)(masterItemTranslationSchema).optional(),
    aliases: zod_1.z.array(aliasSchema).optional(),
    variantTemplates: zod_1.z.array(masterVariantTemplateSchema).optional(),
});
exports.updateMasterCatalogItemSchema = exports.createMasterCatalogItemSchema.partial();
exports.importMasterCatalogItemSchema = zod_1.z
    .object({
    organizationId: validation_1.optionalTrimmedString,
    categoryMode: zod_1.z.enum(["AUTO_CREATE", "USE_EXISTING"]),
    existingCategoryId: validation_1.optionalTrimmedString,
    allowDuplicate: zod_1.z.boolean().optional(),
    strictIndustryMatch: zod_1.z.boolean().optional(),
    forceImport: zod_1.z.boolean().optional(),
    defaultVariantTemplateId: validation_1.optionalTrimmedString,
    pricingOverrides: zod_1.z
        .object({
        variantPrices: zod_1.z.array(pricingOverrideSchema).optional(),
    })
        .optional(),
    namingOverrides: namingOverrideSchema.optional(),
})
    .superRefine((value, ctx) => {
    if (value.categoryMode === "USE_EXISTING" && !value.existingCategoryId) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "existingCategoryId is required when categoryMode is USE_EXISTING",
            path: ["existingCategoryId"],
        });
    }
});
exports.importManyMasterCatalogItemsSchema = zod_1.z
    .object({
    organizationId: validation_1.optionalTrimmedString,
    categoryMode: zod_1.z.enum(["AUTO_CREATE", "USE_EXISTING"]),
    existingCategoryId: validation_1.optionalTrimmedString,
    allowDuplicate: zod_1.z.boolean().optional(),
    strictIndustryMatch: zod_1.z.boolean().optional(),
    forceImport: zod_1.z.boolean().optional(),
    items: zod_1.z
        .array(zod_1.z.object({
        masterItemId: validation_1.trimmedString,
        defaultVariantTemplateId: validation_1.optionalTrimmedString,
        pricingOverrides: zod_1.z
            .object({
            variantPrices: zod_1.z.array(pricingOverrideSchema).optional(),
        })
            .optional(),
        namingOverrides: namingOverrideSchema.optional(),
    }))
        .min(1),
})
    .superRefine((value, ctx) => {
    if (value.categoryMode === "USE_EXISTING" && !value.existingCategoryId) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "existingCategoryId is required when categoryMode is USE_EXISTING",
            path: ["existingCategoryId"],
        });
    }
});
exports.featuredMasterCatalogItemsQuerySchema = zod_1.z.object({
    lang: validation_1.optionalTrimmedString,
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(8),
});
