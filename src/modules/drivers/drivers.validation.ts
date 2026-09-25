import { DriverStatus } from "@prisma/client";
import { z } from "zod";

export const listAssignableDriversQuerySchema = z.object({
  status: z.nativeEnum(DriverStatus).optional(),
  // Pickup branch — when given, each driver also gets `distanceKm` from it and the list is
  // sorted nearest-available first (the shop's "Assign driver" sheet).
  branchId: z.string().trim().min(1).optional(),
  // Only the branch's own drivers (requires branchId) — the "My own driver" picker.
  shopOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const createDriverShopCodeSchema = z.object({
  branchId: z.string().trim().min(1),
});

export const listShopDriversQuerySchema = z.object({
  branchId: z.string().trim().min(1).optional(),
});

export const shopDriverParamsSchema = z.object({
  driverId: z.string().trim().min(1),
});

export const joinDriverShopSchema = z.object({
  storeCode: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{6}$/, "Store code is 6 letters/numbers")),
});
