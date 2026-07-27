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
    // Auth token for the hosted libSQL/Turso database referenced by DATABASE_URL. Optional since a
    // local `file:` SQLite URL (e.g. for tests) needs no auth — passed separately from the URL to
    // PrismaLibSql's Config object (see src/config/prisma.ts), mirroring NearCart/backend's setup.
    DATABASE_AUTH_TOKEN: z.string().trim().optional(),
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
    // Defaults on (2026-07-23 product decision) — requires LIBRETRANSLATE_URL to be reachable;
    // AUTO_TRANSLATE_FAIL_OPEN keeps writes succeeding (untranslated) if it isn't.
    AUTO_TRANSLATE_ON_WRITE: booleanFromEnv.default(true),
    AUTO_TRANSLATE_FAIL_OPEN: booleanFromEnv.default(true),
    TRANSLATION_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
    CLOUDINARY_CLOUD_NAME: z.string().trim().min(1).optional(),
    CLOUDINARY_API_KEY: z.string().trim().min(1).optional(),
    CLOUDINARY_API_SECRET: z.string().trim().min(1).optional(),
    CLOUDINARY_UPLOAD_FOLDER: z.string().trim().min(1).default("nearcart-inventory"),
    IMAGE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
    MARKETPLACE_INTERNAL_TOKEN: z.string().trim().min(1).optional(),
    // Outbound reverse notification webhook (this backend -> NearCart) — same shared secret as
    // MARKETPLACE_INTERNAL_TOKEN authenticates NearCart's inbound calls to us, reused here for
    // the reverse direction so no second secret is needed.
    NEARCART_SERVICE_URL: z.string().trim().url().optional(),
    FIREBASE_PROJECT_ID: z.string().trim().min(1).optional(),
    FIREBASE_CLIENT_EMAIL: z.string().trim().min(1).optional(),
    FIREBASE_PRIVATE_KEY: z.string().trim().min(1).optional(),
    SMTP_HOST: z.string().trim().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanFromEnv.default(false),
    SMTP_USER: z.string().trim().min(1).optional(),
    SMTP_PASS: z.string().trim().min(1).optional(),
    SMTP_FROM: z.string().trim().min(1).default("NearCart Inventory <no-reply@nearcart.app>"),
    OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    // How long a bridged/created PENDING SalesOrder waits for shop confirmation before the
    // order-confirmation-sweep cron auto-rejects it (see jobs/order-confirmation-sweep.ts).
    ORDER_CONFIRMATION_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(10),
    // Max distance (km) a driver's last known location may be from a branch's pickup point to be
    // considered for nearest-free-driver auto-assignment (see sales-orders driver-matching logic).
    DRIVER_MATCH_RADIUS_KM: z.coerce.number().positive().default(15),
    // Driver access-token lifetime is deliberately short (unlike JWT_EXPIRES_IN's 7d default for
    // org staff) now that DriverRefreshToken (see utils/driverRefreshToken.ts) provides real
    // months-long session longevity via rotation — the access token only needs to bridge the gap
    // between refreshes.
    DRIVER_JWT_EXPIRES_IN: z.string().min(1).default("1d"),
    // "Months" tenor for a driver's rotating refresh session, mirroring NearCart/backend's
    // AUTH_REFRESH_TTL_DAYS for the same reason (long-lived mobile sessions).
    DRIVER_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(90),
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
  )
  .refine(
    (values) =>
      (!!values.CLOUDINARY_CLOUD_NAME && !!values.CLOUDINARY_API_KEY && !!values.CLOUDINARY_API_SECRET) ||
      (!values.CLOUDINARY_CLOUD_NAME && !values.CLOUDINARY_API_KEY && !values.CLOUDINARY_API_SECRET),
    {
      message:
        "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set together when enabling uploads",
      path: ["CLOUDINARY_CLOUD_NAME"],
    },
  )
  .refine(
    (values) => (!!values.SMTP_HOST && !!values.SMTP_USER && !!values.SMTP_PASS) || !values.SMTP_HOST,
    {
      message: "SMTP_USER and SMTP_PASS must be set together with SMTP_HOST when enabling email delivery",
      path: ["SMTP_HOST"],
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
