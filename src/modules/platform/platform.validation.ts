import { DriverStatus } from "@prisma/client";
import { z } from "zod";

import {
  languageCodeSchema,
  optionalTrimmedString,
  paginationQuerySchema,
  trimmedString,
  uniqueLanguageArraySchema,
} from "../../utils/validation";

const industryTranslationSchema = z.object({
  language: languageCodeSchema,
  name: trimmedString,
  description: optionalTrimmedString,
});

export const industriesQuerySchema = z.object({
  lang: optionalTrimmedString,
});

export const createIndustrySchema = z.object({
  code: trimmedString,
  name: trimmedString,
  description: optionalTrimmedString,
  isActive: z.boolean().optional(),
  defaultFeatures: z.record(z.any()),
  defaultSettings: z.unknown().optional(),
  customFieldDefinitions: z.unknown().optional(),
  translations: uniqueLanguageArraySchema(industryTranslationSchema).optional(),
});

export const updateIndustrySchema = createIndustrySchema.partial();

export const platformDriversQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(DriverStatus).optional(),
});
