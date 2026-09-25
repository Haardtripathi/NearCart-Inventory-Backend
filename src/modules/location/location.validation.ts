import { z } from "zod";

export const autocompleteQuerySchema = z.object({
  input: z.string().trim().min(1, "input is required"),
  sessionToken: z.string().trim().optional(),
  language: z.string().trim().optional(),
  region: z.string().trim().length(2).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusMeters: z.coerce.number().positive().max(50_000).optional(),
});

export const geocodeQuerySchema = z
  .object({
    address: z.string().trim().min(1).optional(),
    placeId: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.address || value.placeId), {
    message: "address or placeId is required",
  });

export const reverseGeocodeQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
