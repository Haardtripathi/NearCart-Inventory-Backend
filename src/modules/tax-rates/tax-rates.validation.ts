import { z } from "zod";

import {
  decimalInputSchema,
  paginationQuerySchema,
  optionalTrimmedString,
  strictBooleanQueryParam,
  trimmedString,
} from "../../utils/validation";

export const taxRateQuerySchema = paginationQuerySchema.extend({
  // strictBooleanQueryParam (not z.coerce.boolean()): the latter treats the query string
  // "false" as truthy, silently inverting an explicit ?isActive=false filter.
  isActive: strictBooleanQueryParam,
});

export const createTaxRateSchema = z.object({
  name: trimmedString,
  code: optionalTrimmedString,
  rate: decimalInputSchema,
  isInclusive: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateTaxRateSchema = createTaxRateSchema.partial();
