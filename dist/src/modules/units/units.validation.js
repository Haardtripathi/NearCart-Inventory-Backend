"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUnitSchema = exports.unitQuerySchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.unitQuerySchema = validation_1.paginationQuerySchema;
exports.createUnitSchema = zod_1.z.object({
    code: validation_1.trimmedString,
    name: validation_1.trimmedString,
    symbol: validation_1.optionalTrimmedString,
    allowsDecimal: zod_1.z.boolean().optional(),
});
