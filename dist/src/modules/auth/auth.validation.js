"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMyPreferencesSchema = exports.changePasswordSchema = exports.resetPasswordSchema = exports.completeAccountSetupSchema = exports.registerOrganizationOwnerSchema = exports.loginSchema = exports.bootstrapSuperAdminSchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
const branchInputSchema = zod_1.z.object({
    code: validation_1.optionalTrimmedString, // Optional - not all small stores have branch codes
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
});
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
exports.registerOrganizationOwnerSchema = zod_1.z.object({
    fullName: validation_1.trimmedString,
    email: zod_1.z.string().trim().email(),
    password: zod_1.z.string().min(8),
    preferredLanguage: zod_1.z.nativeEnum(client_1.LanguageCode).optional(),
    name: validation_1.trimmedString,
    slug: validation_1.optionalTrimmedString,
    legalName: validation_1.optionalTrimmedString,
    phone: validation_1.optionalTrimmedString,
    organizationEmail: validation_1.optionalEmailSchema,
    currencyCode: validation_1.optionalTrimmedString,
    timezone: validation_1.optionalTrimmedString,
    defaultLanguage: zod_1.z.nativeEnum(client_1.LanguageCode).optional(),
    enabledLanguages: (0, validation_1.uniqueLanguageArraySchema)(validation_1.languageCodeSchema).optional(),
    settings: zod_1.z.unknown().optional(),
    primaryIndustryId: validation_1.trimmedString,
    enabledFeatures: zod_1.z.record(zod_1.z.any()).optional(),
    customSettings: zod_1.z.unknown().optional(),
    firstBranch: branchInputSchema,
});
exports.completeAccountSetupSchema = zod_1.z.object({
    token: validation_1.trimmedString,
    password: zod_1.z.string().min(8),
});
exports.resetPasswordSchema = exports.completeAccountSetupSchema;
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(8),
    newPassword: zod_1.z.string().min(8),
});
exports.updateMyPreferencesSchema = zod_1.z.object({
    preferredLanguage: zod_1.z.nativeEnum(client_1.LanguageCode),
});
