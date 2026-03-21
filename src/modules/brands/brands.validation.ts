import { LanguageCode } from "@prisma/client";
import { z } from "zod";

import { languageCodeSchema, paginationQuerySchema, optionalTrimmedString, trimmedString } from "../../utils/validation";

const brandTranslationSchema = z.object({
  language: languageCodeSchema,
  name: trimmedString,
});

export const brandQuerySchema = paginationQuerySchema.extend({
  isActive: z.coerce.boolean().optional(),
  search: optionalTrimmedString,
});

export const createBrandSchema = z.object({
  name: trimmedString,
  slug: optionalTrimmedString,
  isActive: z.boolean().optional(),
  translations: z.array(brandTranslationSchema).optional(),
});

export const updateBrandSchema = createBrandSchema.partial();
