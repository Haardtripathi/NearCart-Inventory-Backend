"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reverseGeocodeQuerySchema = exports.geocodeQuerySchema = exports.autocompleteQuerySchema = void 0;
const zod_1 = require("zod");
exports.autocompleteQuerySchema = zod_1.z.object({
    input: zod_1.z.string().trim().min(1, "input is required"),
    sessionToken: zod_1.z.string().trim().optional(),
    language: zod_1.z.string().trim().optional(),
    region: zod_1.z.string().trim().length(2).optional(),
    lat: zod_1.z.coerce.number().min(-90).max(90).optional(),
    lng: zod_1.z.coerce.number().min(-180).max(180).optional(),
    radiusMeters: zod_1.z.coerce.number().positive().max(50_000).optional(),
});
exports.geocodeQuerySchema = zod_1.z
    .object({
    address: zod_1.z.string().trim().min(1).optional(),
    placeId: zod_1.z.string().trim().min(1).optional(),
})
    .refine((value) => Boolean(value.address || value.placeId), {
    message: "address or placeId is required",
});
exports.reverseGeocodeQuerySchema = zod_1.z.object({
    lat: zod_1.z.coerce.number().min(-90).max(90),
    lng: zod_1.z.coerce.number().min(-180).max(180),
});
