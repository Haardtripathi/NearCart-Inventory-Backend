import { LanguageCode, MembershipStatus, UserRole } from "@prisma/client";
import { z } from "zod";

import { optionalTrimmedString, trimmedString } from "../../utils/validation";

const branchAccessSchema = z
  .object({
    scope: z.enum(["ALL", "SELECTED"]).default("ALL"),
    branchIds: z.array(trimmedString).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "SELECTED" && value.branchIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select at least one branch for limited access",
        path: ["branchIds"],
      });
    }
  });

export const usersDirectoryQuerySchema = z.object({
  search: optionalTrimmedString,
});

export const createOrganizationUserSchema = z.object({
  fullName: trimmedString,
  email: z.string().trim().email(),
  role: z.nativeEnum(UserRole),
  preferredLanguage: z.nativeEnum(LanguageCode).optional(),
  branchAccess: branchAccessSchema.optional(),
});

export const updateOrganizationUserSchema = z
  .object({
    fullName: trimmedString.optional(),
    role: z.nativeEnum(UserRole).optional(),
    preferredLanguage: z.nativeEnum(LanguageCode).optional(),
    status: z.nativeEnum(MembershipStatus).optional(),
    branchAccess: branchAccessSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be updated",
  });
