"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateVariantSchema = exports.createVariantSchema = exports.updateProductSchema = exports.createProductSchema = exports.productQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
const productTranslationSchema = zod_1.z.object({
    language: validation_1.languageCodeSchema,
    name: validation_1.trimmedString,
    description: validation_1.optionalTrimmedString,
});
const variantTranslationSchema = zod_1.z.object({
    language: validation_1.languageCodeSchema,
    name: validation_1.trimmedString,
});
const variantInputSchema = zod_1.z.object({
    name: validation_1.optionalTrimmedString,
    sku: validation_1.trimmedString,
    barcode: validation_1.optionalTrimmedString,
    attributes: zod_1.z.unknown().optional(),
    costPrice: validation_1.decimalInputSchema,
    sellingPrice: validation_1.decimalInputSchema,
    mrp: validation_1.optionalDecimalInputSchema,
    reorderLevel: validation_1.optionalDecimalInputSchema,
    minStockLevel: validation_1.optionalDecimalInputSchema,
    maxStockLevel: validation_1.optionalDecimalInputSchema,
    weight: validation_1.optionalDecimalInputSchema,
    unitId: validation_1.optionalTrimmedString,
    isDefault: zod_1.z.boolean().optional(),
    isActive: zod_1.z.boolean().optional(),
    imageUrl: validation_1.optionalTrimmedString,
    customFields: zod_1.z.unknown().optional(),
    metadata: zod_1.z.unknown().optional(),
    translations: (0, validation_1.uniqueLanguageArraySchema)(variantTranslationSchema).optional(),
});
const productBaseSchema = zod_1.z.object({
    categoryId: validation_1.optionalTrimmedString,
    brandId: validation_1.optionalTrimmedString,
    taxRateId: validation_1.optionalTrimmedString,
    industryId: validation_1.optionalTrimmedString,
    name: validation_1.trimmedString,
    slug: validation_1.optionalTrimmedString,
    description: validation_1.optionalTrimmedString,
    productType: zod_1.z.nativeEnum(client_1.ProductType),
    status: zod_1.z.nativeEnum(client_1.ProductStatus).optional(),
    hasVariants: zod_1.z.boolean().optional(),
    trackInventory: zod_1.z.boolean().optional(),
    allowBackorder: zod_1.z.boolean().optional(),
    allowNegativeStock: zod_1.z.boolean().optional(),
    trackMethod: zod_1.z.nativeEnum(client_1.TrackMethod).optional(),
    primaryUnitId: validation_1.optionalTrimmedString,
    imageUrl: validation_1.optionalTrimmedString,
    tags: zod_1.z.unknown().optional(),
    customFields: zod_1.z.unknown().optional(),
    metadata: zod_1.z.unknown().optional(),
    translations: (0, validation_1.uniqueLanguageArraySchema)(productTranslationSchema).optional(),
});
exports.productQuerySchema = validation_1.paginationQuerySchema.extend({
    status: zod_1.z.nativeEnum(client_1.ProductStatus).optional(),
    categoryId: validation_1.optionalTrimmedString,
    brandId: validation_1.optionalTrimmedString,
    hasVariants: zod_1.z.coerce.boolean().optional(),
    lang: validation_1.optionalTrimmedString,
});
exports.createProductSchema = productBaseSchema.extend({
    defaultVariant: variantInputSchema.optional(),
    variants: zod_1.z.array(variantInputSchema).min(1).optional(),
});
exports.updateProductSchema = productBaseSchema.partial();
exports.createVariantSchema = variantInputSchema;
exports.updateVariantSchema = variantInputSchema.partial();
