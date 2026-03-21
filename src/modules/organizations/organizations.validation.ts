import { BranchType, LanguageCode, OrganizationStatus } from "@prisma/client";
import { z } from "zod";

import {
  languageCodeSchema,
  optionalEmailSchema,
  optionalTrimmedString,
  trimmedString,
  uniqueLanguageArraySchema,
} from "../../utils/validation";

const branchInputSchema = z.object({
  code: trimmedString,
  name: trimmedString,
  type: z.nativeEnum(BranchType),
  phone: optionalTrimmedString,
  email: optionalEmailSchema,
  addressLine1: optionalTrimmedString,
  addressLine2: optionalTrimmedString,
  city: optionalTrimmedString,
  state: optionalTrimmedString,
  country: optionalTrimmedString,
  postalCode: optionalTrimmedString,
});

const ownerInputSchema = z.object({
  fullName: trimmedString,
  email: z.string().trim().email(),
  preferredLanguage: z.nativeEnum(LanguageCode).optional(),
});

export const createOrganizationSchema = z.object({
  name: trimmedString,
  slug: optionalTrimmedString,
  legalName: optionalTrimmedString,
  phone: optionalTrimmedString,
  email: optionalEmailSchema,
  status: z.nativeEnum(OrganizationStatus).optional(),
  currencyCode: optionalTrimmedString,
  timezone: optionalTrimmedString,
  defaultLanguage: z.nativeEnum(LanguageCode).optional(),
  enabledLanguages: uniqueLanguageArraySchema(languageCodeSchema).optional(),
  settings: z.unknown().optional(),
  ownerUserId: optionalTrimmedString,
  owner: ownerInputSchema.optional(),
  primaryIndustryId: trimmedString,
  enabledFeatures: z.record(z.any()).optional(),
  customSettings: z.unknown().optional(),
  firstBranch: branchInputSchema,
}).superRefine((value, ctx) => {
  if (value.ownerUserId && value.owner) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either ownerUserId or owner details, not both",
      path: ["owner"],
    });
  }
});

export const addOrganizationIndustrySchema = z.object({
  industryId: trimmedString,
  isPrimary: z.boolean().optional(),
  enabledFeatures: z.record(z.any()).optional(),
  customSettings: z.unknown().optional(),
});
