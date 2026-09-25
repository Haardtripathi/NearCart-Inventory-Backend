"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.joinDriverShopSchema = exports.shopDriverParamsSchema = exports.listShopDriversQuerySchema = exports.createDriverShopCodeSchema = exports.listAssignableDriversQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
exports.listAssignableDriversQuerySchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(client_1.DriverStatus).optional(),
    // Pickup branch — when given, each driver also gets `distanceKm` from it and the list is
    // sorted nearest-available first (the shop's "Assign driver" sheet).
    branchId: zod_1.z.string().trim().min(1).optional(),
    // Only the branch's own drivers (requires branchId) — the "My own driver" picker.
    shopOnly: zod_1.z
        .enum(["true", "false"])
        .optional()
        .transform((value) => value === "true"),
});
exports.createDriverShopCodeSchema = zod_1.z.object({
    branchId: zod_1.z.string().trim().min(1),
});
exports.listShopDriversQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().trim().min(1).optional(),
});
exports.shopDriverParamsSchema = zod_1.z.object({
    driverId: zod_1.z.string().trim().min(1),
});
exports.joinDriverShopSchema = zod_1.z.object({
    storeCode: zod_1.z
        .string()
        .trim()
        .transform((value) => value.replace(/\s+/g, "").toUpperCase())
        .pipe(zod_1.z.string().regex(/^[A-Z0-9]{6}$/, "Store code is 6 letters/numbers")),
});
