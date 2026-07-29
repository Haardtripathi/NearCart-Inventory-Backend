"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDriverLocationSchema = exports.updateDriverAvailabilitySchema = void 0;
const zod_1 = require("zod");
exports.updateDriverAvailabilitySchema = zod_1.z.object({
    isAvailableForAssignment: zod_1.z.boolean(),
});
exports.updateDriverLocationSchema = zod_1.z.object({
    latitude: zod_1.z.number().min(-90).max(90),
    longitude: zod_1.z.number().min(-180).max(180),
});
