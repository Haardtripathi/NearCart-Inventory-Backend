import { z } from "zod";

import { paginationQuerySchema, optionalTrimmedString, trimmedString } from "../../utils/validation";

export const brandQuerySchema = paginationQuerySchema.extend({
  isActive: z.coerce.boolean().optional(),
});

export const createBrandSchema = z.object({
  name: trimmedString,
  slug: optionalTrimmedString,
  isActive: z.boolean().optional(),
});

export const updateBrandSchema = createBrandSchema.partial();
