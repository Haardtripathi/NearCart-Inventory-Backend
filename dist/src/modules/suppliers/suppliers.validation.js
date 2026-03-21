"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSupplierSchema = exports.createSupplierSchema = exports.supplierQuerySchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
const supplierTranslationSchema = zod_1.z.object({
    language: validation_1.languageCodeSchema,
    name: validation_1.trimmedString,
});
exports.supplierQuerySchema = validation_1.paginationQuerySchema.extend({
    isActive: zod_1.z.coerce.boolean().optional(),
});
exports.createSupplierSchema = zod_1.z.object({
    name: validation_1.trimmedString,
    code: validation_1.optionalTrimmedString,
    phone: validation_1.optionalTrimmedString,
    email: validation_1.optionalEmailSchema,
    taxNumber: validation_1.optionalTrimmedString,
    address: zod_1.z.unknown().optional(),
    notes: validation_1.optionalTrimmedString,
    isActive: zod_1.z.boolean().optional(),
    translations: (0, validation_1.uniqueLanguageArraySchema)(supplierTranslationSchema).optional(),
});
exports.updateSupplierSchema = exports.createSupplierSchema.partial();
