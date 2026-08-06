import "dotenv/config";
import { z } from "zod";

// `.optional()` alone only allows a var to be ABSENT, not blank — but a `.env` file's `KEY=`
// line (a common, standard way to document an available-but-unset var) is a present empty
// string, not undefined. Every `.string().min(1).optional()` field below crashed the whole
// server at boot on exactly this: RESEND_API_KEY= and REPLICATE_API_TOKEN= being present-but-
// blank failed min(1) even though they're meant to be optional. Coercing empty string to
// undefined first fixes the whole class of field, not just the two that happened to be blank
// tonight.
const optionalNonEmptyString = z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().min(1).optional());

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
    UPSTASH_REDIS_REST_TOKEN: optionalNonEmptyString,
    REDIS_KEY_PREFIX: z.string().trim().min(1).default("nearcart"),
    LIBRETRANSLATE_URL: z.string().trim().url().default("http://127.0.0.1:5000"),
    // Defaults on (2026-07-23 product decision) — requires LIBRETRANSLATE_URL to be reachable;
    // AUTO_TRANSLATE_FAIL_OPEN keeps writes succeeding (untranslated) if it isn't.
    AUTO_TRANSLATE_ON_WRITE: booleanFromEnv.default(true),
    AUTO_TRANSLATE_FAIL_OPEN: booleanFromEnv.default(true),
    TRANSLATION_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
    CLOUDINARY_CLOUD_NAME: optionalNonEmptyString,
    CLOUDINARY_API_KEY: optionalNonEmptyString,
    CLOUDINARY_API_SECRET: optionalNonEmptyString,
    CLOUDINARY_UPLOAD_FOLDER: z.string().trim().min(1).default("nearcart-inventory"),
    IMAGE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
    MARKETPLACE_INTERNAL_TOKEN: optionalNonEmptyString,
    // Outbound reverse notification webhook (this backend -> NearCart) — same shared secret as
    // MARKETPLACE_INTERNAL_TOKEN authenticates NearCart's inbound calls to us, reused here for
    // the reverse direction so no second secret is needed.
    NEARCART_SERVICE_URL: z.string().trim().url().optional(),
    FIREBASE_PROJECT_ID: optionalNonEmptyString,
    FIREBASE_CLIENT_EMAIL: optionalNonEmptyString,
    FIREBASE_PRIVATE_KEY: optionalNonEmptyString,
    SMTP_HOST: optionalNonEmptyString,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanFromEnv.default(false),
    SMTP_USER: optionalNonEmptyString,
    SMTP_PASS: optionalNonEmptyString,
    SMTP_FROM: z.string().trim().min(1).default("NearCart Inventory <no-reply@nearcart.app>"),
    // Highest priority when set — see utils/mailer.ts. Added 2026-08-01 after confirming that
    // even Brevo's own SMTP relay (smtp-relay.brevo.com:587) gets ETIMEDOUT on some Render
    // service instances despite working fine on others with identical credentials — a real
    // per-service network egress restriction, not a config issue. Brevo's HTTP API isn't
    // affected since it's a normal HTTPS call, same reasoning as RESEND_API_KEY below but with
    // Brevo's un-restricted-recipient free tier instead of Resend's own-email-only sandbox.
    BREVO_API_KEY: optionalNonEmptyString,
    BREVO_FROM: z.string().trim().min(1).default("NearCart Inventory <no-reply@nearcart.app>"),
    // Preferred over raw SMTP when BREVO_API_KEY is unset — see utils/mailer.ts. Resend's HTTP
    // API isn't affected by SMTP-port blocking either, but its free tier restricts sending to
    // the account's own email until a domain is verified there.
    RESEND_API_KEY: optionalNonEmptyString,
    // "onboarding@resend.dev" is Resend's own shared sending address, usable before you've
    // verified a custom domain with them — fine for getting OTP emails working immediately;
    // swap to a verified domain address once one is set up.
    RESEND_FROM: z.string().trim().min(1).default("NearCart Inventory <onboarding@resend.dev>"),
    OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    // How long a bridged/created PENDING SalesOrder waits for shop confirmation before the
    // order-confirmation-sweep cron auto-rejects it (see jobs/order-confirmation-sweep.ts).
    ORDER_CONFIRMATION_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(10),
    // Max distance (km) a driver's last known location may be from a branch's pickup point to be
    // considered for nearest-free-driver auto-assignment (see sales-orders driver-matching logic).
    DRIVER_MATCH_RADIUS_KM: z.coerce.number().positive().default(15),
    // Flat per-delivery payout used to compute the driver app's earnings dashboard
    // (modules/driver-orders's earnings-summary endpoint). There's no per-order delivery-fee
    // column anywhere in the schema yet — deliveries are costed at this single flat rate rather
    // than inventing a new financial field mid-flight while another agent may be touching
    // schema.prisma concurrently. Revisit once a real fee model exists.
    DRIVER_DELIVERY_FEE: z.coerce.number().nonnegative().default(30),
    // Driver access-token lifetime is deliberately short (unlike JWT_EXPIRES_IN's 7d default for
    // org staff) now that DriverRefreshToken (see utils/driverRefreshToken.ts) provides real
    // months-long session longevity via rotation — the access token only needs to bridge the gap
    // between refreshes.
    DRIVER_JWT_EXPIRES_IN: z.string().min(1).default("1d"),
    // "Months" tenor for a driver's rotating refresh session, mirroring NearCart/backend's
    // AUTH_REFRESH_TTL_DAYS for the same reason (long-lived mobile sessions).
    DRIVER_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(90),
    // Server-side Google Maps key: reverse-geocoding a dropped pin into address fields (branch
    // location picker) and Places Text/Nearby Search for shop-photo verification
    // (placeLocationMatch check in POST /branches/:id/verification/photo). Optional — when unset,
    // reverse-geocode calls fail closed (caller keeps the manual address fields, which are always
    // editable regardless) and placeLocationMatch/matchedPlaceCandidates come back empty with a
    // reason string rather than throwing.
    GOOGLE_MAPS_API_KEY: optionalNonEmptyString,
    // Shop-photo clarity/name-OCR (POST /branches/:id/verification/photo) and driver
    // vehicle-photo/license OCR (POST /driver/verification/*). Leave unset to run in stub mode —
    // those endpoints return a clear 503 { error: "verification_unavailable" } instead of
    // crashing the server. Mirrors the CLOUDINARY_* stub-mode convention above exactly: the
    // feature is fully wired end-to-end and activates the instant a real token is set here, no
    // further code changes needed.
    REPLICATE_API_TOKEN: optionalNonEmptyString,
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
  )
  .refine(
    (values) => {
      const urlLower = values.DATABASE_URL.toLowerCase();
      const isRemote = urlLower.startsWith("libsql://") || urlLower.startsWith("https://");
      if (isRemote && !values.DATABASE_AUTH_TOKEN) {
        return false;
      }
      return true;
    },
    {
      message: "DATABASE_AUTH_TOKEN is required for remote libSQL/Turso database URLs",
      path: ["DATABASE_AUTH_TOKEN"],
    }
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
