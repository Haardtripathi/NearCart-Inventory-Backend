"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCategorySchema = exports.createCategorySchema = exports.categoryQuerySchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.categoryQuerySchema = validation_1.paginationQuerySchema.extend({
    parentId: validation_1.optionalTrimmedString,
    isActive: zod_1.z.coerce.boolean().optional(),
});
exports.createCategorySchema = zod_1.z.object({
    parentId: validation_1.optionalTrimmedString,
    name: validation_1.trimmedString,
    slug: validation_1.optionalTrimmedString,
    description: validation_1.optionalTrimmedString,
    isActive: zod_1.z.boolean().optional(),
    sortOrder: zod_1.z.coerce.number().int().min(0).optional(),
    customFields: zod_1.z.unknown().optional(),
});
exports.updateCategorySchema = exports.createCategorySchema.partial();
