import { z } from "zod";

import {
  optionalEmailSchema,
  paginationQuerySchema,
  optionalTrimmedString,
  trimmedString,
} from "../../utils/validation";

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
});

export const updateSupplierSchema = createSupplierSchema.partial();
