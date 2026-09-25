import { z } from "zod";

import { optionalEmailSchema, trimmedString } from "../../utils/validation";

export const registerDriverSchema = z.object({
  fullName: trimmedString,
  phone: trimmedString,
  email: optionalEmailSchema,
  password: z.string().min(8),
  vehicleType: trimmedString,
  vehicleNumber: trimmedString,
  // Optional one-time store code from a shop (2026-09-24): makes this a shop-owned driver. Blank
  // is treated as not given.
  storeCode: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, "").toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9]{6}$/, "Store code is 6 letters/numbers"))
      .optional(),
  ),
});

export const loginDriverSchema = z
  .object({
    phone: trimmedString.optional(),
    email: optionalEmailSchema,
    password: z.string().min(1),
  })
  .refine((value) => Boolean(value.phone || value.email), {
    message: "Either phone or email is required",
    path: ["phone"],
  });

export const refreshDriverTokenSchema = z.object({
  refreshToken: trimmedString,
});

export const logoutDriverSchema = z.object({
  refreshToken: trimmedString,
});

export const sendDriverEmailOtpSchema = z.object({
  email: z.string().trim().email(),
});

export const verifyDriverEmailOtpSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(6),
});
