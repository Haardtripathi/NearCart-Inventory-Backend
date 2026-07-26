import { z } from "zod";

import {
  decimalInputSchema,
  nullableTrimmedString,
  optionalTrimmedString,
  paginationQuerySchema,
  strictBooleanQueryParam,
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
  // strictBooleanQueryParam (not z.coerce.boolean()): the latter treats the query string
  // "false" as truthy (Boolean("false") === true), which would silently invert an explicit
  // `inStockOnly=false` from a caller instead of respecting it.
  inStockOnly: strictBooleanQueryParam,
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
        // Nullable: NearCart sends `variantId: item.variantId || null` for cart items that
        // weren't validated against a specific variant (public-storefront.service.ts) — the same
        // pattern as `inventoryVariantId` in the bridged sales-order schema below.
        // optionalTrimmedString would reject a literal `null` (only string | undefined pass
        // z.string().optional()), rejecting this exact real request shape with a 400.
        variantId: nullableTrimmedString,
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
  // Nullable: NearCart's Order.notes column is `String?` — a caller forwarding it verbatim would
  // send a literal `null` when no notes were given, which optionalTrimmedString would reject.
  notes: nullableTrimmedString,
});

export const externalOrderIdParamSchema = z.object({
  externalOrderId: trimmedString,
});

export const organizationExternalOrderIdParamSchema = z.object({
  organizationId: trimmedString,
  externalOrderId: trimmedString,
});

export const organizationBranchParamSchema = z.object({
  organizationId: trimmedString,
  branchId: trimmedString,
});
