import { LanguageCode } from "@prisma/client";
import { z } from "zod";

import { languageCodeSchema, paginationQuerySchema, optionalTrimmedString, strictBooleanQueryParam, trimmedString } from "../../utils/validation";

const brandTranslationSchema = z.object({
  language: languageCodeSchema,
  name: trimmedString,
});

export const brandQuerySchema = paginationQuerySchema.extend({
  // strictBooleanQueryParam (not z.coerce.boolean()): the latter treats the query string
  // "false" as truthy, silently inverting an explicit ?isActive=false filter.
  isActive: strictBooleanQueryParam,
  search: optionalTrimmedString,
});

export const createBrandSchema = z.object({
  name: trimmedString,
  slug: optionalTrimmedString,
  isActive: z.boolean().optional(),
  translations: z.array(brandTranslationSchema).optional(),
});

export const updateBrandSchema = createBrandSchema.partial();
