"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrganizationUserSchema = exports.createOrganizationUserSchema = exports.usersDirectoryQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
const branchAccessSchema = zod_1.z
    .object({
    scope: zod_1.z.enum(["ALL", "SELECTED"]).default("ALL"),
    branchIds: zod_1.z.array(validation_1.trimmedString).default([]),
})
    .superRefine((value, ctx) => {
    if (value.scope === "SELECTED" && value.branchIds.length === 0) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "Select at least one branch for limited access",
            path: ["branchIds"],
        });
    }
});
exports.usersDirectoryQuerySchema = zod_1.z.object({
    search: validation_1.optionalTrimmedString,
});
exports.createOrganizationUserSchema = zod_1.z.object({
    fullName: validation_1.trimmedString,
    email: zod_1.z.string().trim().email(),
    role: zod_1.z.nativeEnum(client_1.UserRole),
    preferredLanguage: zod_1.z.nativeEnum(client_1.LanguageCode).optional(),
    branchAccess: branchAccessSchema.optional(),
});
exports.updateOrganizationUserSchema = zod_1.z
    .object({
    fullName: validation_1.trimmedString.optional(),
    role: zod_1.z.nativeEnum(client_1.UserRole).optional(),
    preferredLanguage: zod_1.z.nativeEnum(client_1.LanguageCode).optional(),
    status: zod_1.z.nativeEnum(client_1.MembershipStatus).optional(),
    branchAccess: branchAccessSchema.optional(),
})
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be updated",
});
