"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const adapter_libsql_1 = require("@prisma/adapter-libsql");
const client_1 = require("@prisma/client");
const env_1 = require("./env");
function createPrismaClient() {
    const adapter = new adapter_libsql_1.PrismaLibSql({
        url: env_1.env.DATABASE_URL,
        ...(env_1.env.DATABASE_AUTH_TOKEN ? { authToken: env_1.env.DATABASE_AUTH_TOKEN } : {}),
    });
    return new client_1.PrismaClient({
        adapter,
        log: env_1.env.NODE_ENV === "development" ? ["query", "info", "warn", "error"] : ["warn", "error"],
    });
}
const prismaClient = global.__prismaClient__ ?? createPrismaClient();
if (env_1.env.NODE_ENV !== "production") {
    global.__prismaClient__ = prismaClient;
}
exports.prisma = prismaClient;
