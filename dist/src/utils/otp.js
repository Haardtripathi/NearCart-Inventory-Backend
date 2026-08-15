"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueOtp = issueOtp;
exports.verifyOtp = verifyOtp;
const node_crypto_1 = __importDefault(require("node:crypto"));
const env_1 = require("../config/env");
const redis_1 = require("../config/redis");
const ApiError_1 = require("./ApiError");
function otpKey(purpose, subjectId) {
    return `otp:${purpose}:${subjectId}`;
}
function cooldownKey(purpose, subjectId) {
    return `otp:${purpose}:cooldown:${subjectId}`;
}
function hashCode(purpose, subjectId, code) {
    return node_crypto_1.default.createHash("sha256").update(`${purpose}:${subjectId}:${code}`).digest("hex");
}
function generateCode() {
    return node_crypto_1.default.randomInt(0, 1_000_000).toString().padStart(6, "0");
}
function requireRedis() {
    const redis = (0, redis_1.getRedisClient)();
    if (!redis) {
        // Redis is optional infra elsewhere (translation cache, rate limiting) but OTP codes must
        // never be persisted in Postgres, so when it isn't configured/connected we fail closed with a
        // clear error instead of silently falling back to some less safe storage.
        throw new ApiError_1.ApiError(503, "Verification codes are temporarily unavailable, please try again shortly");
    }
    return redis;
}
/**
 * Issues a new OTP code for the given purpose/subject, storing only its hash in Redis with a
 * short TTL. Enforces a resend cooldown so a client cannot spam new codes. Returns the raw code
 * so the caller can email it — it is never persisted anywhere in plaintext.
 */
async function issueOtp(purpose, subjectId) {
    const redis = requireRedis();
    const cooldownActive = await redis.get(cooldownKey(purpose, subjectId));
    if (cooldownActive) {
        throw ApiError_1.ApiError.conflict("Please wait a bit before requesting another code");
    }
    const code = generateCode();
    const record = {
        codeHash: hashCode(purpose, subjectId, code),
        attempts: 0,
        createdAt: new Date().toISOString(),
    };
    await redis.set(otpKey(purpose, subjectId), JSON.stringify(record), "EX", env_1.env.OTP_TTL_MINUTES * 60);
    await redis.set(cooldownKey(purpose, subjectId), "1", "EX", env_1.env.OTP_RESEND_COOLDOWN_SECONDS);
    return code;
}
/**
 * Verifies a submitted code against the stored hash. Tracks attempts against OTP_MAX_ATTEMPTS to
 * slow down brute-forcing a 6-digit code, and deletes the record once used/exhausted.
 */
async function verifyOtp(purpose, subjectId, code) {
    const redis = requireRedis();
    const key = otpKey(purpose, subjectId);
    const raw = await redis.get(key);
    if (!raw) {
        throw ApiError_1.ApiError.badRequest("This code has expired or was not requested. Please request a new one.");
    }
    let record;
    try {
        record = JSON.parse(raw);
    }
    catch {
        await redis.del(key);
        throw ApiError_1.ApiError.badRequest("This code has expired or was not requested. Please request a new one.");
    }
    if (record.attempts >= env_1.env.OTP_MAX_ATTEMPTS) {
        await redis.del(key);
        throw ApiError_1.ApiError.badRequest("Too many incorrect attempts. Please request a new code.");
    }
    const matches = record.codeHash === hashCode(purpose, subjectId, code);
    if (!matches) {
        const ttl = await redis.ttl(key);
        record.attempts += 1;
        await redis.set(key, JSON.stringify(record), "EX", ttl > 0 ? ttl : env_1.env.OTP_TTL_MINUTES * 60);
        throw ApiError_1.ApiError.badRequest("Incorrect code. Please try again.");
    }
    await redis.del(key);
}
