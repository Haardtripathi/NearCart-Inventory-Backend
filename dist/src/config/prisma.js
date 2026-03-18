"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const env_1 = require("./env");
const prismaClient = global.__prismaClient__ ??
    new client_1.PrismaClient({
        log: env_1.env.NODE_ENV === "development" ? ["query", "info", "warn", "error"] : ["warn", "error"],
    });
if (env_1.env.NODE_ENV !== "production") {
    global.__prismaClient__ = prismaClient;
}
exports.prisma = prismaClient;
