"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCustomerSchema = exports.createCustomerSchema = exports.customerQuerySchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.customerQuerySchema = validation_1.paginationQuerySchema.extend({
    isActive: zod_1.z.coerce.boolean().optional(),
});
exports.createCustomerSchema = zod_1.z.object({
    name: validation_1.trimmedString,
    phone: validation_1.optionalTrimmedString,
    email: validation_1.optionalEmailSchema,
    address: zod_1.z.unknown().optional(),
    notes: validation_1.optionalTrimmedString,
    isActive: zod_1.z.boolean().optional(),
});
exports.updateCustomerSchema = exports.createCustomerSchema.partial();
