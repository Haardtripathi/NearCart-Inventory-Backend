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
    // Bug fix: this used to be a plain `GET` (check) followed by a separate `SET` (claim) — not
    // atomic, so a burst of concurrent "send code" requests for the same purpose/subject (a client
    // double-tapping "resend," or two devices signed into the same not-yet-verified account) could
    // all read "no cooldown yet" before any of them committed one, each generating and emailing its
    // OWN code and each overwriting the previous one in Redis. Whichever email arrived last would
    // hold the only code that still verifies, silently invalidating any earlier one — confusing at
    // best, and it defeats the cooldown's actual purpose (bounding how many codes/emails a burst of
    // requests can trigger). `setIfNotExists` (atomic `SET ... EX ... NX`) makes claiming the
    // cooldown window itself the compare-and-swap: only the caller that actually wins it proceeds
    // to generate/store/return a code — everyone else gets the same conflict error as before.
    const claimedCooldown = await redis.setIfNotExists(cooldownKey(purpose, subjectId), "1", env_1.env.OTP_RESEND_COOLDOWN_SECONDS);
    if (!claimedCooldown) {
        throw ApiError_1.ApiError.conflict("Please wait a bit before requesting another code");
    }
    const code = generateCode();
    const record = {
        codeHash: hashCode(purpose, subjectId, code),
        attempts: 0,
        createdAt: new Date().toISOString(),
    };
    await redis.set(otpKey(purpose, subjectId), JSON.stringify(record), "EX", env_1.env.OTP_TTL_MINUTES * 60);
    return code;
}
// Runs the whole "read record, check attempt limit, compare hash, then delete-on-match or
// increment-on-mismatch" sequence as a single atomic Redis operation via EVAL, instead of the
// separate get/set/del round-trips the previous implementation used. Two concurrent verify calls
// for the same OTP — whether both guessing wrong (racing the attempts counter) or both submitting
// the same correct code (racing the delete-on-success) — now serialize through this one script
// invocation: Redis executes an EVAL body to completion before starting any other command, on
// both supported backends (a real Redis server via ioredis, or Upstash's REST-exposed Redis,
// which is protocol-compatible and executes EVAL with the same atomicity guarantee).
//
// Returns a single word describing the outcome; anything JSON-parse-failure related in the stored
// record is treated as EXPIRED (same as a missing key) rather than surfacing a raw script error.
const VERIFY_OTP_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 'EXPIRED'
end

local ok, record = pcall(cjson.decode, raw)
if not ok or type(record) ~= 'table' or record.codeHash == nil then
  redis.call('DEL', KEYS[1])
  return 'EXPIRED'
end

local attempts = tonumber(record.attempts) or 0
local maxAttempts = tonumber(ARGV[2])

if attempts >= maxAttempts then
  redis.call('DEL', KEYS[1])
  return 'TOO_MANY_ATTEMPTS'
end

if record.codeHash == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 'MATCH'
end

local ttl = redis.call('TTL', KEYS[1])
record.attempts = attempts + 1
local updated = cjson.encode(record)
if ttl and ttl > 0 then
  redis.call('SET', KEYS[1], updated, 'EX', ttl)
else
  redis.call('SET', KEYS[1], updated)
end
return 'MISMATCH'
`;
const OTP_VERIFY_OUTCOME_MESSAGES = {
    EXPIRED: "This code has expired or was not requested. Please request a new one.",
    TOO_MANY_ATTEMPTS: "Too many incorrect attempts. Please request a new code.",
    MISMATCH: "Incorrect code. Please try again.",
};
/**
 * Verifies a submitted code against the stored hash. Tracks attempts against OTP_MAX_ATTEMPTS to
 * slow down brute-forcing a 6-digit code, and deletes the record once used/exhausted — all
 * atomically (see VERIFY_OTP_SCRIPT above), so this is genuinely single-use and the attempt limit
 * can't be undercounted under concurrent requests.
 */
async function verifyOtp(purpose, subjectId, code) {
    const redis = requireRedis();
    const key = otpKey(purpose, subjectId);
    const codeHash = hashCode(purpose, subjectId, code);
    const outcome = await redis.eval(VERIFY_OTP_SCRIPT, [key], [codeHash, env_1.env.OTP_MAX_ATTEMPTS]);
    if (outcome === "MATCH") {
        return;
    }
    const message = typeof outcome === "string" ? OTP_VERIFY_OUTCOME_MESSAGES[outcome] : undefined;
    throw ApiError_1.ApiError.badRequest(message ?? "Incorrect code. Please try again.");
}
