import "dotenv/config";
import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    PORT: z.coerce.number().int().positive().default(5001),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    JWT_EXPIRES_IN: z.string().min(1).default("7d"),
    ADMIN_BOOTSTRAP_SECRET: z.string().min(1, "ADMIN_BOOTSTRAP_SECRET is required"),
    CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
    REDIS_URL: z.string().trim().optional(),
    UPSTASH_REDIS_REST_URL: z.string().trim().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().trim().min(1).optional(),
    REDIS_KEY_PREFIX: z.string().trim().min(1).default("nearcart"),
    LIBRETRANSLATE_URL: z.string().trim().url().default("http://127.0.0.1:5000"),
    AUTO_TRANSLATE_ON_WRITE: booleanFromEnv.default(true),
    AUTO_TRANSLATE_FAIL_OPEN: booleanFromEnv.default(false),
    TRANSLATION_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  })
  .refine(
    (values) =>
      (!!values.UPSTASH_REDIS_REST_URL && !!values.UPSTASH_REDIS_REST_TOKEN) ||
      (!values.UPSTASH_REDIS_REST_URL && !values.UPSTASH_REDIS_REST_TOKEN),
    {
      message:
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together when using Upstash REST",
      path: ["UPSTASH_REDIS_REST_URL"],
    },
  );

const parsed = envSchema.safeParse({
  ...process.env,
  LIBRETRANSLATE_URL: process.env.LIBRETRANSLATE_URL ?? process.env.LIBRETRANSLATE_ENDPOINT,
});

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
