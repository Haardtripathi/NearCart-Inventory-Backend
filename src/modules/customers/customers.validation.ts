import { z } from "zod";

import {
  optionalEmailSchema,
  paginationQuerySchema,
  optionalTrimmedString,
  trimmedString,
} from "../../utils/validation";

export const customerQuerySchema = paginationQuerySchema.extend({
  isActive: z.coerce.boolean().optional(),
});

export const createCustomerSchema = z.object({
  name: trimmedString,
  phone: optionalTrimmedString,
  email: optionalEmailSchema,
  address: z.unknown().optional(),
  notes: optionalTrimmedString,
  isActive: z.boolean().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();
