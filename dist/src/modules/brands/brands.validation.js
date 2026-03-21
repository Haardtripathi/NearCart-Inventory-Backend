"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBrandSchema = exports.createBrandSchema = exports.brandQuerySchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
const brandTranslationSchema = zod_1.z.object({
    language: validation_1.languageCodeSchema,
    name: validation_1.trimmedString,
});
exports.brandQuerySchema = validation_1.paginationQuerySchema.extend({
    isActive: zod_1.z.coerce.boolean().optional(),
    search: validation_1.optionalTrimmedString,
});
exports.createBrandSchema = zod_1.z.object({
    name: validation_1.trimmedString,
    slug: validation_1.optionalTrimmedString,
    isActive: zod_1.z.boolean().optional(),
    translations: zod_1.z.array(brandTranslationSchema).optional(),
});
exports.updateBrandSchema = exports.createBrandSchema.partial();
