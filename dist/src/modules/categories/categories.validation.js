"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCategorySchema = exports.createCategorySchema = exports.categoryQuerySchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
const categoryTranslationSchema = zod_1.z.object({
    language: validation_1.languageCodeSchema,
    name: validation_1.trimmedString,
    description: validation_1.optionalTrimmedString,
});
exports.categoryQuerySchema = validation_1.paginationQuerySchema.extend({
    parentId: validation_1.optionalTrimmedString,
    isActive: zod_1.z.coerce.boolean().optional(),
    lang: validation_1.optionalTrimmedString,
});
exports.createCategorySchema = zod_1.z.object({
    parentId: validation_1.optionalTrimmedString,
    name: validation_1.trimmedString,
    slug: validation_1.optionalTrimmedString,
    description: validation_1.optionalTrimmedString,
    isActive: zod_1.z.boolean().optional(),
    sortOrder: zod_1.z.coerce.number().int().min(0).optional(),
    customFields: zod_1.z.unknown().optional(),
    translations: (0, validation_1.uniqueLanguageArraySchema)(categoryTranslationSchema).optional(),
});
exports.updateCategorySchema = exports.createCategorySchema.partial();
