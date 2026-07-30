"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBranchSchema = exports.createBranchSchema = exports.branchQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.branchQuerySchema = validation_1.paginationQuerySchema.extend({
    // strictBooleanQueryParam (not z.coerce.boolean()): the latter treats the query string
    // "false" as truthy, silently inverting an explicit ?isActive=false filter.
    isActive: validation_1.strictBooleanQueryParam,
});
exports.createBranchSchema = zod_1.z.object({
    code: validation_1.optionalTrimmedString, // Auto-generated if not provided
    name: validation_1.trimmedString,
    type: zod_1.z.nativeEnum(client_1.BranchType),
    phone: validation_1.optionalTrimmedString,
    email: validation_1.optionalEmailSchema,
    addressLine1: validation_1.optionalTrimmedString,
    addressLine2: validation_1.optionalTrimmedString,
    city: validation_1.optionalTrimmedString,
    state: validation_1.optionalTrimmedString,
    country: validation_1.optionalTrimmedString,
    postalCode: validation_1.optionalTrimmedString,
    // Pickup-point coordinates for nearest-free-driver auto-assignment (see
    // `findNearestFreeDriver` in sales-orders.service.ts) — optional since not every shop owner has
    // coordinates handy at creation time; can be backfilled later via PATCH.
    latitude: validation_1.optionalLatitudeSchema,
    longitude: validation_1.optionalLongitudeSchema,
    isActive: zod_1.z.boolean().optional(),
});
exports.updateBranchSchema = exports.createBranchSchema.partial();
