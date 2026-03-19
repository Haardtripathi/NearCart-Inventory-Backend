"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.auditLogQuerySchema = validation_1.paginationQuerySchema.extend({
    action: zod_1.z.nativeEnum(client_1.AuditAction).optional(),
    entityType: validation_1.optionalTrimmedString,
    actor: validation_1.optionalTrimmedString,
    startDate: validation_1.optionalDateInputSchema,
    endDate: validation_1.optionalDateInputSchema,
});
