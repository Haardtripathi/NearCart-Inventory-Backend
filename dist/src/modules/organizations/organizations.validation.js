"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addOrganizationIndustrySchema = exports.createOrganizationSchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
const branchInputSchema = zod_1.z.object({
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
});
const ownerInputSchema = zod_1.z.object({
    fullName: validation_1.trimmedString,
    email: zod_1.z.string().trim().email(),
    preferredLanguage: zod_1.z.nativeEnum(client_1.LanguageCode).optional(),
});
exports.createOrganizationSchema = zod_1.z.object({
    name: validation_1.trimmedString,
    slug: validation_1.optionalTrimmedString,
    legalName: validation_1.optionalTrimmedString,
    phone: validation_1.optionalTrimmedString,
    email: validation_1.optionalEmailSchema,
    status: zod_1.z.nativeEnum(client_1.OrganizationStatus).optional(),
    currencyCode: validation_1.optionalTrimmedString,
    timezone: validation_1.optionalTrimmedString,
    defaultLanguage: zod_1.z.nativeEnum(client_1.LanguageCode).optional(),
    enabledLanguages: (0, validation_1.uniqueLanguageArraySchema)(validation_1.languageCodeSchema).optional(),
    settings: zod_1.z.unknown().optional(),
    ownerUserId: validation_1.optionalTrimmedString,
    owner: ownerInputSchema.optional(),
    primaryIndustryId: validation_1.trimmedString,
    enabledFeatures: zod_1.z.record(zod_1.z.any()).optional(),
    customSettings: zod_1.z.unknown().optional(),
    firstBranch: branchInputSchema,
}).superRefine((value, ctx) => {
    if (value.ownerUserId && value.owner) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "Provide either ownerUserId or owner details, not both",
            path: ["owner"],
        });
    }
});
exports.addOrganizationIndustrySchema = zod_1.z.object({
    industryId: validation_1.trimmedString,
    isPrimary: zod_1.z.boolean().optional(),
    enabledFeatures: zod_1.z.record(zod_1.z.any()).optional(),
    customSettings: zod_1.z.unknown().optional(),
});
