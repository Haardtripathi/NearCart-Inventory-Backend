import { ProductStatus, ProductType, TrackMethod } from "@prisma/client";
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

const productTranslationSchema = z.object({
  language: languageCodeSchema,
  name: trimmedString,
  description: optionalTrimmedString,
});

const variantTranslationSchema = z.object({
  language: languageCodeSchema,
  name: trimmedString,
});

const variantInputSchema = z.object({
  name: optionalTrimmedString,
  sku: trimmedString,
  barcode: optionalTrimmedString,
  attributes: z.unknown().optional(),
  costPrice: decimalInputSchema,
  sellingPrice: decimalInputSchema,
  mrp: optionalDecimalInputSchema,
  reorderLevel: optionalDecimalInputSchema,
  minStockLevel: optionalDecimalInputSchema,
  maxStockLevel: optionalDecimalInputSchema,
  weight: optionalDecimalInputSchema,
  unitId: optionalTrimmedString,
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  imageUrl: optionalTrimmedString,
  customFields: z.unknown().optional(),
  metadata: z.unknown().optional(),
  translations: uniqueLanguageArraySchema(variantTranslationSchema).optional(),
});

const productBaseSchema = z.object({
  categoryId: optionalTrimmedString,
  brandId: optionalTrimmedString,
  taxRateId: optionalTrimmedString,
  industryId: optionalTrimmedString,
  name: trimmedString,
  slug: optionalTrimmedString,
  description: optionalTrimmedString,
  productType: z.nativeEnum(ProductType),
  status: z.nativeEnum(ProductStatus).optional(),
  hasVariants: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
  allowBackorder: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
  trackMethod: z.nativeEnum(TrackMethod).optional(),
  primaryUnitId: optionalTrimmedString,
  imageUrl: optionalTrimmedString,
  tags: z.unknown().optional(),
  customFields: z.unknown().optional(),
  metadata: z.unknown().optional(),
  translations: uniqueLanguageArraySchema(productTranslationSchema).optional(),
});

export const productQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(ProductStatus).optional(),
  categoryId: optionalTrimmedString,
  brandId: optionalTrimmedString,
  hasVariants: z.coerce.boolean().optional(),
  lang: optionalTrimmedString,
});

export const createProductSchema = productBaseSchema.extend({
  defaultVariant: variantInputSchema.optional(),
  variants: z.array(variantInputSchema).min(1).optional(),
});

export const updateProductSchema = productBaseSchema.partial();

export const createVariantSchema = variantInputSchema;
export const updateVariantSchema = variantInputSchema.partial();
