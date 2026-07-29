import { z } from "zod";

import {
  languageCodeSchema,
  optionalEmailSchema,
  paginationQuerySchema,
  optionalTrimmedString,
  strictBooleanQueryParam,
  trimmedString,
  uniqueLanguageArraySchema,
} from "../../utils/validation";

const supplierTranslationSchema = z.object({
  language: languageCodeSchema,
  name: trimmedString,
});

export const supplierQuerySchema = paginationQuerySchema.extend({
  // strictBooleanQueryParam (not z.coerce.boolean()): the latter treats the query string
  // "false" as truthy, silently inverting an explicit ?isActive=false filter.
  isActive: strictBooleanQueryParam,
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
