"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginSchema = exports.bootstrapSuperAdminSchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.bootstrapSuperAdminSchema = zod_1.z.object({
    secret: validation_1.trimmedString,
    fullName: validation_1.trimmedString,
    email: zod_1.z.string().trim().email(),
    password: zod_1.z.string().min(8),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email(),
    password: zod_1.z.string().min(8),
    organizationId: validation_1.optionalTrimmedString,
});
