import { z } from "zod";

export const updateDriverAvailabilitySchema = z.object({
  isAvailableForAssignment: z.boolean(),
});

export const updateDriverLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
