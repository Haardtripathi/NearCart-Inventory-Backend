"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAssignableDriversQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
exports.listAssignableDriversQuerySchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(client_1.DriverStatus).optional(),
});
