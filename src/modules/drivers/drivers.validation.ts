import { DriverStatus } from "@prisma/client";
import { z } from "zod";

export const listAssignableDriversQuerySchema = z.object({
  status: z.nativeEnum(DriverStatus).optional(),
  // Pickup branch — when given, each driver also gets `distanceKm` from it and the list is
  // sorted nearest-available first (the shop's "Assign driver" sheet).
  branchId: z.string().trim().min(1).optional(),
});
