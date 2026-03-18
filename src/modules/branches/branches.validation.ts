import { BranchType } from "@prisma/client";
import { z } from "zod";

import {
  optionalEmailSchema,
  paginationQuerySchema,
  optionalTrimmedString,
  trimmedString,
} from "../../utils/validation";

export const branchQuerySchema = paginationQuerySchema.extend({
  isActive: z.coerce.boolean().optional(),
});

export const createBranchSchema = z.object({
  code: trimmedString,
  name: trimmedString,
  type: z.nativeEnum(BranchType),
  phone: optionalTrimmedString,
  email: optionalEmailSchema,
  addressLine1: optionalTrimmedString,
  addressLine2: optionalTrimmedString,
  city: optionalTrimmedString,
  state: optionalTrimmedString,
  country: optionalTrimmedString,
  postalCode: optionalTrimmedString,
  isActive: z.boolean().optional(),
});

export const updateBranchSchema = createBranchSchema.partial();
