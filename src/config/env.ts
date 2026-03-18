import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().min(1).default("7d"),
  ADMIN_BOOTSTRAP_SECRET: z.string().min(1, "ADMIN_BOOTSTRAP_SECRET is required"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
