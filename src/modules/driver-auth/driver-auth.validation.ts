import { z } from "zod";

import { optionalEmailSchema, trimmedString } from "../../utils/validation";

export const registerDriverSchema = z.object({
  fullName: trimmedString,
  phone: trimmedString,
  email: optionalEmailSchema,
  password: z.string().min(8),
  vehicleType: trimmedString,
  vehicleNumber: trimmedString,
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
