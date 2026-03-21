import { z } from "zod";

import {
  languageCodeSchema,
  paginationQuerySchema,
  optionalTrimmedString,
  trimmedString,
  uniqueLanguageArraySchema,
} from "../../utils/validation";

export const unitQuerySchema = paginationQuerySchema;

const unitTranslationSchema = z.object({
  language: languageCodeSchema,
  name: trimmedString,
});

export const createUnitSchema = z.object({
  code: trimmedString,
  name: trimmedString,
  symbol: optionalTrimmedString,
  allowsDecimal: z.boolean().optional(),
  translations: uniqueLanguageArraySchema(unitTranslationSchema).optional(),
});

export const updateUnitSchema = createUnitSchema.partial();
