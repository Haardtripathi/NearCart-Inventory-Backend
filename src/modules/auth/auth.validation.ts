import { BranchType, LanguageCode } from "@prisma/client";
import { z } from "zod";

import {
  languageCodeSchema,
  optionalEmailSchema,
  optionalLatitudeSchema,
  optionalLongitudeSchema,
  optionalTrimmedString,
  trimmedString,
  uniqueLanguageArraySchema,
} from "../../utils/validation";

const branchInputSchema = z.object({
  code: optionalTrimmedString, // Optional - not all small stores have branch codes
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
  // Optional at registration time — a shop owner may not have coordinates handy while signing
  // up; can be backfilled later via PATCH /branches/:id. See branches.validation.ts.
  latitude: optionalLatitudeSchema,
  longitude: optionalLongitudeSchema,
});

export const bootstrapSuperAdminSchema = z.object({
  secret: trimmedString,
  fullName: trimmedString,
  email: z.string().trim().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  organizationId: optionalTrimmedString,
});

export const registerOrganizationOwnerSchema = z.object({
  fullName: trimmedString,
  email: z.string().trim().email(),
  password: z.string().min(8),
  preferredLanguage: z.nativeEnum(LanguageCode).optional(),
  name: trimmedString,
  slug: optionalTrimmedString,
  legalName: optionalTrimmedString,
  phone: optionalTrimmedString,
  organizationEmail: optionalEmailSchema,
  currencyCode: optionalTrimmedString,
  timezone: optionalTrimmedString,
  defaultLanguage: z.nativeEnum(LanguageCode).optional(),
  enabledLanguages: uniqueLanguageArraySchema(languageCodeSchema).optional(),
  settings: z.unknown().optional(),
  primaryIndustryId: trimmedString,
  enabledFeatures: z.record(z.any()).optional(),
  customSettings: z.unknown().optional(),
  firstBranch: branchInputSchema,
});

export const completeAccountSetupSchema = z.object({
  token: trimmedString,
  password: z.string().min(8),
});

export const resetPasswordSchema = completeAccountSetupSchema;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

export const updateMyPreferencesSchema = z.object({
  preferredLanguage: z.nativeEnum(LanguageCode),
});

export const sendEmailOtpSchema = z.object({
  email: z.string().trim().email(),
});

export const verifyEmailOtpSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(6),
});
