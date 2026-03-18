import { z } from "zod";

import {
  decimalInputSchema,
  paginationQuerySchema,
  optionalTrimmedString,
  trimmedString,
} from "../../utils/validation";

export const taxRateQuerySchema = paginationQuerySchema.extend({
  isActive: z.coerce.boolean().optional(),
});

export const createTaxRateSchema = z.object({
  name: trimmedString,
  code: optionalTrimmedString,
  rate: decimalInputSchema,
  isInclusive: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateTaxRateSchema = createTaxRateSchema.partial();
