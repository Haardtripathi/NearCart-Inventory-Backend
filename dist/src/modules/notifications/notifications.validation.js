"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationLogQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.notificationLogQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    unreadOnly: validation_1.strictBooleanQueryParam,
    type: zod_1.z.nativeEnum(client_1.NotificationLogType).optional(),
});
