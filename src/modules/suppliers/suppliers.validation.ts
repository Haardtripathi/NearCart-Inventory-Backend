import { z } from "zod";

import {
  languageCodeSchema,
  optionalEmailSchema,
  paginationQuerySchema,
  optionalTrimmedString,
  trimmedString,
  uniqueLanguageArraySchema,
} from "../../utils/validation";

const supplierTranslationSchema = z.object({
  language: languageCodeSchema,
  name: trimmedString,
});

export const supplierQuerySchema = paginationQuerySchema.extend({
  isActive: z.coerce.boolean().optional(),
});

export const createSupplierSchema = z.object({
  name: trimmedString,
  code: optionalTrimmedString,
  phone: optionalTrimmedString,
  email: optionalEmailSchema,
  taxNumber: optionalTrimmedString,
  address: z.unknown().optional(),
  notes: optionalTrimmedString,
  isActive: z.boolean().optional(),
  translations: uniqueLanguageArraySchema(supplierTranslationSchema).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();
