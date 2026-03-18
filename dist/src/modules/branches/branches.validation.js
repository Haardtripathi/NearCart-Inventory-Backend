"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBranchSchema = exports.createBranchSchema = exports.branchQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.branchQuerySchema = validation_1.paginationQuerySchema.extend({
    isActive: zod_1.z.coerce.boolean().optional(),
});
exports.createBranchSchema = zod_1.z.object({
    code: validation_1.trimmedString,
    name: validation_1.trimmedString,
    type: zod_1.z.nativeEnum(client_1.BranchType),
    phone: validation_1.optionalTrimmedString,
    email: validation_1.optionalEmailSchema,
    addressLine1: validation_1.optionalTrimmedString,
    addressLine2: validation_1.optionalTrimmedString,
    city: validation_1.optionalTrimmedString,
    state: validation_1.optionalTrimmedString,
    country: validation_1.optionalTrimmedString,
    postalCode: validation_1.optionalTrimmedString,
    isActive: zod_1.z.boolean().optional(),
});
exports.updateBranchSchema = exports.createBranchSchema.partial();
