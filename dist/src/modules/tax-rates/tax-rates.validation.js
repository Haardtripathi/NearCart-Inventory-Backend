"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTaxRateSchema = exports.createTaxRateSchema = exports.taxRateQuerySchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.taxRateQuerySchema = validation_1.paginationQuerySchema.extend({
    isActive: zod_1.z.coerce.boolean().optional(),
});
exports.createTaxRateSchema = zod_1.z.object({
    name: validation_1.trimmedString,
    code: validation_1.optionalTrimmedString,
    rate: validation_1.decimalInputSchema,
    isInclusive: zod_1.z.boolean().optional(),
    isActive: zod_1.z.boolean().optional(),
});
exports.updateTaxRateSchema = exports.createTaxRateSchema.partial();
