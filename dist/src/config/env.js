"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    DATABASE_URL: zod_1.z.string().min(1, "DATABASE_URL is required"),
    PORT: zod_1.z.coerce.number().int().positive().default(5000),
    NODE_ENV: zod_1.z.enum(["development", "test", "production"]).default("development"),
    JWT_SECRET: zod_1.z.string().min(1, "JWT_SECRET is required"),
    JWT_EXPIRES_IN: zod_1.z.string().min(1).default("7d"),
    ADMIN_BOOTSTRAP_SECRET: zod_1.z.string().min(1, "ADMIN_BOOTSTRAP_SECRET is required"),
    CORS_ORIGIN: zod_1.z.string().min(1).default("http://localhost:5173"),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
}
exports.env = parsed.data;
