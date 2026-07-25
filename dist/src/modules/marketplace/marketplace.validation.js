"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.externalOrderIdParamSchema = exports.createBridgedSalesOrderSchema = exports.marketplaceAvailabilitySchema = exports.marketplaceScopedQuerySchema = exports.marketplaceCatalogQuerySchema = exports.marketplaceOrganizationsQuerySchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.marketplaceOrganizationsQuerySchema = zod_1.z.object({
    search: validation_1.optionalTrimmedString,
    lang: validation_1.optionalTrimmedString,
});
exports.marketplaceCatalogQuerySchema = validation_1.paginationQuerySchema.extend({
    branchId: validation_1.trimmedString,
    category: validation_1.optionalTrimmedString,
    brand: validation_1.optionalTrimmedString,
    inStockOnly: zod_1.z.coerce.boolean().optional(),
    sort: zod_1.z.enum(["featured", "name-asc", "price-asc", "price-desc", "newest"]).default("featured"),
    lang: validation_1.optionalTrimmedString,
});
exports.marketplaceScopedQuerySchema = zod_1.z.object({
    branchId: validation_1.trimmedString,
    lang: validation_1.optionalTrimmedString,
});
exports.marketplaceAvailabilitySchema = zod_1.z.object({
    branchId: validation_1.trimmedString,
    items: zod_1.z
        .array(zod_1.z.object({
        productId: validation_1.trimmedString,
        variantId: validation_1.optionalTrimmedString,
        quantity: zod_1.z.coerce.number().positive(),
    }))
        .min(1),
    lang: validation_1.optionalTrimmedString,
});
const bridgedSalesOrderCustomerSchema = zod_1.z.object({
    name: validation_1.trimmedString,
    phone: validation_1.trimmedString,
    addressLine: validation_1.optionalTrimmedString,
    // .nullable() matters here: NearCart sends `latitude: order.latitude` verbatim, which is a
    // nullable column (unknown location) — without .nullable(), z.coerce.number() would coerce a
    // literal `null` to 0 (Number(null) === 0) instead of rejecting/preserving it as unknown.
    latitude: zod_1.z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: zod_1.z.coerce.number().min(-180).max(180).nullable().optional(),
});
const bridgedSalesOrderItemSchema = zod_1.z.object({
    inventoryProductId: validation_1.trimmedString,
    // Nullable: NearCart sends `inventoryVariantId: item.inventoryVariantId ?? null` for cart items
    // that were validated without pinning a specific variant (see NearCart's
    // public-storefront.service.ts: `variantId: item.variantId || null`). When absent, the service
    // resolves the product's default/first variant instead of requiring an exact id match.
    inventoryVariantId: validation_1.nullableTrimmedString,
    quantity: validation_1.decimalInputSchema,
    unitPrice: validation_1.decimalInputSchema,
});
exports.createBridgedSalesOrderSchema = zod_1.z.object({
    branchId: validation_1.trimmedString,
    externalOrderId: validation_1.trimmedString,
    externalOrderNumber: validation_1.optionalTrimmedString,
    customer: bridgedSalesOrderCustomerSchema,
    items: zod_1.z.array(bridgedSalesOrderItemSchema).min(1),
    notes: validation_1.optionalTrimmedString,
});
exports.externalOrderIdParamSchema = zod_1.z.object({
    externalOrderId: validation_1.trimmedString,
});
