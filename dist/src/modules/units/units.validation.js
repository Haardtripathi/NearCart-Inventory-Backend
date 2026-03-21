"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUnitSchema = exports.createUnitSchema = exports.unitQuerySchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.unitQuerySchema = validation_1.paginationQuerySchema;
const unitTranslationSchema = zod_1.z.object({
    language: validation_1.languageCodeSchema,
    name: validation_1.trimmedString,
});
exports.createUnitSchema = zod_1.z.object({
    code: validation_1.trimmedString,
    name: validation_1.trimmedString,
    symbol: validation_1.optionalTrimmedString,
    allowsDecimal: zod_1.z.boolean().optional(),
    translations: (0, validation_1.uniqueLanguageArraySchema)(unitTranslationSchema).optional(),
});
exports.updateUnitSchema = exports.createUnitSchema.partial();
