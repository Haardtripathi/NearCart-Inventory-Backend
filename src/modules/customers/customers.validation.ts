import { z } from "zod";

import {
  optionalEmailSchema,
  paginationQuerySchema,
  optionalTrimmedString,
  strictBooleanQueryParam,
  trimmedString,
} from "../../utils/validation";

export const customerQuerySchema = paginationQuerySchema.extend({
  // strictBooleanQueryParam (not z.coerce.boolean()): the latter treats the query string
  // "false" as truthy, silently inverting an explicit ?isActive=false filter.
  isActive: strictBooleanQueryParam,
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
