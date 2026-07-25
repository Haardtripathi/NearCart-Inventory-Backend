import { z } from "zod";

import {
  decimalInputSchema,
  nullableTrimmedString,
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

const bridgedSalesOrderCustomerSchema = z.object({
  name: trimmedString,
  phone: trimmedString,
  addressLine: optionalTrimmedString,
  // .nullable() matters here: NearCart sends `latitude: order.latitude` verbatim, which is a
  // nullable column (unknown location) — without .nullable(), z.coerce.number() would coerce a
  // literal `null` to 0 (Number(null) === 0) instead of rejecting/preserving it as unknown.
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
});

const bridgedSalesOrderItemSchema = z.object({
  inventoryProductId: trimmedString,
  // Nullable: NearCart sends `inventoryVariantId: item.inventoryVariantId ?? null` for cart items
  // that were validated without pinning a specific variant (see NearCart's
  // public-storefront.service.ts: `variantId: item.variantId || null`). When absent, the service
  // resolves the product's default/first variant instead of requiring an exact id match.
  inventoryVariantId: nullableTrimmedString,
  quantity: decimalInputSchema,
  unitPrice: decimalInputSchema,
});

export const createBridgedSalesOrderSchema = z.object({
  branchId: trimmedString,
  externalOrderId: trimmedString,
  externalOrderNumber: optionalTrimmedString,
  customer: bridgedSalesOrderCustomerSchema,
  items: z.array(bridgedSalesOrderItemSchema).min(1),
  notes: optionalTrimmedString,
});

export const externalOrderIdParamSchema = z.object({
  externalOrderId: trimmedString,
});
