"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateShopStatusSchema = exports.shopStatusQuerySchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.shopStatusQuerySchema = zod_1.z.object({
    branchId: validation_1.optionalTrimmedString,
});
// Mirrors NearCart's own updateShopTodayStatusSchema (isOpen + optional free-text reason, 200
// char cap) so a payload that passes here can never bounce off NearCart's validation with a
// confusing proxied 400.
// 24h "HH:MM", same rule as NearCart's schema. Optional hours the owner confirms when opening.
const shopClockTime = zod_1.z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");
exports.updateShopStatusSchema = zod_1.z.object({
    branchId: validation_1.optionalTrimmedString,
    isOpen: zod_1.z.boolean(),
    reason: zod_1.z.string().trim().max(200).optional(),
    openingTime: shopClockTime.optional(),
    closingTime: shopClockTime.optional(),
});
