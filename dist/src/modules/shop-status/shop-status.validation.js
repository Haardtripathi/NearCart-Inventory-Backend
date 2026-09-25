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
exports.updateShopStatusSchema = zod_1.z.object({
    branchId: validation_1.optionalTrimmedString,
    isOpen: zod_1.z.boolean(),
    reason: zod_1.z.string().trim().max(200).optional(),
});
