"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateIndustrySchema = exports.createIndustrySchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.createIndustrySchema = zod_1.z.object({
    code: validation_1.trimmedString,
    name: validation_1.trimmedString,
    description: validation_1.optionalTrimmedString,
    isActive: zod_1.z.boolean().optional(),
    defaultFeatures: zod_1.z.record(zod_1.z.any()),
    defaultSettings: zod_1.z.unknown().optional(),
    customFieldDefinitions: zod_1.z.unknown().optional(),
});
exports.updateIndustrySchema = exports.createIndustrySchema.partial();
