import { z } from "zod";

import {
  languageCodeSchema,
  paginationQuerySchema,
  optionalTrimmedString,
  strictBooleanQueryParam,
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
  // strictBooleanQueryParam (not z.coerce.boolean()): the latter treats the query string
  // "false" as truthy, silently inverting an explicit ?isActive=false filter.
  isActive: strictBooleanQueryParam,
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
