"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformDriversQuerySchema = exports.updateIndustrySchema = exports.createIndustrySchema = exports.industriesQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
const industryTranslationSchema = zod_1.z.object({
    language: validation_1.languageCodeSchema,
    name: validation_1.trimmedString,
    description: validation_1.optionalTrimmedString,
});
exports.industriesQuerySchema = zod_1.z.object({
    lang: validation_1.optionalTrimmedString,
});
exports.createIndustrySchema = zod_1.z.object({
    code: validation_1.trimmedString,
    name: validation_1.trimmedString,
    description: validation_1.optionalTrimmedString,
    isActive: zod_1.z.boolean().optional(),
    defaultFeatures: zod_1.z.record(zod_1.z.any()),
    defaultSettings: zod_1.z.unknown().optional(),
    customFieldDefinitions: zod_1.z.unknown().optional(),
    translations: (0, validation_1.uniqueLanguageArraySchema)(industryTranslationSchema).optional(),
});
exports.updateIndustrySchema = exports.createIndustrySchema.partial();
exports.platformDriversQuerySchema = validation_1.paginationQuerySchema.extend({
    status: zod_1.z.nativeEnum(client_1.DriverStatus).optional(),
});
