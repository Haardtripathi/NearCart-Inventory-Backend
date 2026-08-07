import crypto from "node:crypto";

import { env } from "../config/env";
import { getRedisClient } from "../config/redis";
import { ApiError } from "./ApiError";

interface OtpRecord {
  codeHash: string;
  attempts: number;
  createdAt: string;
}

function otpKey(purpose: string, subjectId: string) {
  return `otp:${purpose}:${subjectId}`;
}

function cooldownKey(purpose: string, subjectId: string) {
  return `otp:${purpose}:cooldown:${subjectId}`;
}

function hashCode(purpose: string, subjectId: string, code: string) {
  return crypto.createHash("sha256").update(`${purpose}:${subjectId}:${code}`).digest("hex");
}

function generateCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function requireRedis() {
  const redis = getRedisClient();

  if (!redis) {
    // Redis is optional infra elsewhere (translation cache, rate limiting) but OTP codes must
    // never be persisted in Postgres, so when it isn't configured/connected we fail closed with a
    // clear error instead of silently falling back to some less safe storage.
    throw new ApiError(503, "Verification codes are temporarily unavailable, please try again shortly");
  }

  return redis;
}

/**
 * Issues a new OTP code for the given purpose/subject, storing only its hash in Redis with a
 * short TTL. Enforces a resend cooldown so a client cannot spam new codes. Returns the raw code
 * so the caller can email it — it is never persisted anywhere in plaintext.
 */
export async function issueOtp(purpose: string, subjectId: string) {
  const redis = requireRedis();

  const cooldownActive = await redis.get(cooldownKey(purpose, subjectId));

  if (cooldownActive) {
    throw ApiError.conflict("Please wait a bit before requesting another code");
  }

  const code = generateCode();
  const record: OtpRecord = {
    codeHash: hashCode(purpose, subjectId, code),
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  await redis.set(otpKey(purpose, subjectId), JSON.stringify(record), "EX", env.OTP_TTL_MINUTES * 60);
  await redis.set(cooldownKey(purpose, subjectId), "1", "EX", env.OTP_RESEND_COOLDOWN_SECONDS);

  return code;
}

/**
 * Verifies a submitted code against the stored hash. Tracks attempts against OTP_MAX_ATTEMPTS to
 * slow down brute-forcing a 6-digit code, and deletes the record once used/exhausted.
 */
export async function verifyOtp(purpose: string, subjectId: string, code: string) {
  const redis = requireRedis();
  const key = otpKey(purpose, subjectId);
  const raw = await redis.get(key);

  if (!raw) {
    throw ApiError.badRequest("This code has expired or was not requested. Please request a new one.");
  }

  let record: OtpRecord;

  try {
    record = JSON.parse(raw) as OtpRecord;
  } catch {
    await redis.del(key);
    throw ApiError.badRequest("This code has expired or was not requested. Please request a new one.");
  }

  if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
    await redis.del(key);
    throw ApiError.badRequest("Too many incorrect attempts. Please request a new code.");
  }

  const matches = record.codeHash === hashCode(purpose, subjectId, code);

  if (!matches) {
    const ttl = await redis.ttl(key);
    record.attempts += 1;
    await redis.set(key, JSON.stringify(record), "EX", ttl > 0 ? ttl : env.OTP_TTL_MINUTES * 60);
    throw ApiError.badRequest("Incorrect code. Please try again.");
  }

  await redis.del(key);
}
