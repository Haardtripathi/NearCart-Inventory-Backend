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

// Money facts NearCart charged the customer (delivery fee, discount, payment method/status, what
// the customer actually owes). Persisted verbatim under `SalesOrder.deliveryAddress.payment` — see
// utils/orderPayment.ts for why it rides in that Json column and how `amountToCollect` is derived
// from it. Every field is optional so an older NearCart deployment that doesn't send (all of) it
// keeps working; values that ARE sent are strictly typed (closed enums, finite non-negative
// numbers — deliberately NOT z.coerce, which would turn a literal `null` into 0 rupees) so a
// malformed money block fails the push loudly (NearCart marks the sync FAILED and retries) rather
// than being stored as garbage a driver then collects against. Unknown keys are stripped, not
// rejected, so a future NearCart adding a field can't start failing every order push.
const moneyAmountSchema = z.number().finite().nonnegative();

const bridgedSalesOrderPaymentSchema = z.object({
  method: z.enum(["COD", "ONLINE", "PAY_ON_PICKUP"]).optional(),
  status: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]).optional(),
  itemTotal: moneyAmountSchema.optional(),
  deliveryFee: moneyAmountSchema.optional(),
  weatherSurchargeFee: moneyAmountSchema.optional(),
  discountTotal: moneyAmountSchema.optional(),
  loyaltyDiscount: moneyAmountSchema.optional(),
  couponCode: z.string().trim().min(1).max(64).optional(),
  amountPayable: moneyAmountSchema.optional(),
  currency: z.string().trim().min(1).max(8).optional(),
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
  payment: bridgedSalesOrderPaymentSchema.nullable().optional(),
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

export const organizationParamSchema = z.object({
  organizationId: trimmedString,
});

/**
 * The customer's answer to a shop's partial-fulfilment proposal. `accepted` is the whole
 * contract; `revisedPayment` is an optional correction from NearCart for the cases where its own
 * coupon/loyalty rules change the bill beyond the pure item-total reduction this backend can
 * compute on its own (most importantly: a coupon whose minimum spend no longer holds has to be
 * dropped, which pushes the amount payable back UP). Without it we fall back to the proposal's
 * own `proposedAmountPayable`, so an older NearCart keeps working.
 */
const revisedPaymentSchema = z.object({
  discountTotal: moneyAmountSchema.optional(),
  loyaltyDiscount: moneyAmountSchema.optional(),
  couponCode: z.string().trim().min(1).max(64).nullable().optional(),
  amountPayable: moneyAmountSchema.optional(),
});

export const partialFulfilmentResponseSchema = z.object({
  accepted: z.boolean(),
  revisedPayment: revisedPaymentSchema.nullable().optional(),
});
