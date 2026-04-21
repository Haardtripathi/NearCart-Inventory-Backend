import { z } from "zod";

import {
  optionalTrimmedString,
  paginationQuerySchema,
  trimmedString,
} from "../../utils/validation";

export const marketplaceOrganizationsQuerySchema = z.object({
  search: optionalTrimmedString,
  lang: optionalTrimmedString,
});

export const marketplaceCatalogQuerySchema = paginationQuerySchema.extend({
  branchId: trimmedString,
  category: optionalTrimmedString,
  brand: optionalTrimmedString,
  inStockOnly: z.coerce.boolean().optional(),
  sort: z.enum(["featured", "name-asc", "price-asc", "price-desc", "newest"]).default("featured"),
  lang: optionalTrimmedString,
});

export const marketplaceScopedQuerySchema = z.object({
  branchId: trimmedString,
  lang: optionalTrimmedString,
});

export const marketplaceAvailabilitySchema = z.object({
  branchId: trimmedString,
  items: z
    .array(
      z.object({
        productId: trimmedString,
        variantId: optionalTrimmedString,
        quantity: z.coerce.number().positive(),
      }),
    )
    .min(1),
  lang: optionalTrimmedString,
});
