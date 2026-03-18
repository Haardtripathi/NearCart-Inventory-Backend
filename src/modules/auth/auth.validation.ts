import { z } from "zod";

import { optionalTrimmedString, trimmedString } from "../../utils/validation";

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
