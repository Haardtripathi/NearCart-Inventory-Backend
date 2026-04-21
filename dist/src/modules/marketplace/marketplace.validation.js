"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketplaceAvailabilitySchema = exports.marketplaceScopedQuerySchema = exports.marketplaceCatalogQuerySchema = exports.marketplaceOrganizationsQuerySchema = void 0;
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
