"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyDriverEmailOtpSchema = exports.sendDriverEmailOtpSchema = exports.logoutDriverSchema = exports.refreshDriverTokenSchema = exports.loginDriverSchema = exports.registerDriverSchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.registerDriverSchema = zod_1.z.object({
    fullName: validation_1.trimmedString,
    phone: validation_1.trimmedString,
    email: validation_1.optionalEmailSchema,
    password: zod_1.z.string().min(8),
    vehicleType: validation_1.trimmedString,
    vehicleNumber: validation_1.trimmedString,
    // Optional one-time store code from a shop (2026-09-24): makes this a shop-owned driver. Blank
    // is treated as not given.
    storeCode: zod_1.z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), zod_1.z
        .string()
        .trim()
        .transform((value) => value.replace(/\s+/g, "").toUpperCase())
        .pipe(zod_1.z.string().regex(/^[A-Z0-9]{6}$/, "Store code is 6 letters/numbers"))
        .optional()),
});
exports.loginDriverSchema = zod_1.z
    .object({
    phone: validation_1.trimmedString.optional(),
    email: validation_1.optionalEmailSchema,
    password: zod_1.z.string().min(1),
})
    .refine((value) => Boolean(value.phone || value.email), {
    message: "Either phone or email is required",
    path: ["phone"],
});
exports.refreshDriverTokenSchema = zod_1.z.object({
    refreshToken: validation_1.trimmedString,
});
exports.logoutDriverSchema = zod_1.z.object({
    refreshToken: validation_1.trimmedString,
});
exports.sendDriverEmailOtpSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email(),
});
exports.verifyDriverEmailOtpSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email(),
    code: zod_1.z.string().trim().length(6),
});
