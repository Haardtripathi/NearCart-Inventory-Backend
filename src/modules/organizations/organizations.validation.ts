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
  primaryIndustryId: trimmedString,
  enabledFeatures: z.record(z.any()).optional(),
  customSettings: z.unknown().optional(),
  firstBranch: branchInputSchema,
});

export const addOrganizationIndustrySchema = z.object({
  industryId: trimmedString,
  isPrimary: z.boolean().optional(),
  enabledFeatures: z.record(z.any()).optional(),
  customSettings: z.unknown().optional(),
});
