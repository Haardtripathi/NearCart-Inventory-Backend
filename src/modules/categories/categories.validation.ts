import { z } from "zod";

import {
  languageCodeSchema,
  paginationQuerySchema,
  optionalTrimmedString,
  trimmedString,
  uniqueLanguageArraySchema,
} from "../../utils/validation";

const categoryTranslationSchema = z.object({
  language: languageCodeSchema,
  name: trimmedString,
  description: optionalTrimmedString,
});

export const categoryQuerySchema = paginationQuerySchema.extend({
  parentId: optionalTrimmedString,
  isActive: z.coerce.boolean().optional(),
  lang: optionalTrimmedString,
});

export const createCategorySchema = z.object({
  parentId: optionalTrimmedString,
  name: trimmedString,
  slug: optionalTrimmedString,
  description: optionalTrimmedString,
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  customFields: z.unknown().optional(),
  translations: uniqueLanguageArraySchema(categoryTranslationSchema).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();
