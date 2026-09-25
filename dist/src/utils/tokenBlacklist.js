"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blacklistToken = blacklistToken;
exports.isTokenBlacklisted = isTokenBlacklisted;
const redis_1 = require("../config/redis");
function blacklistKey(jti) {
    return `auth-blacklist:${jti}`;
}
/**
 * Revokes a single access token by its jti until the token's own natural expiry — that's the
 * real fix for logout previously being a no-op (it just returned 204 with nothing server-side
 * to back it). Fails open like the translation cache, not fail-closed like OTP's requireRedis():
 * if Redis is unreachable, the client still discards its token and the UX of "logout" is
 * unaffected either way — a still-technically-valid token surviving until natural expiry is the
 * same behavior this endpoint already had before this fix, not a regression introduced by it.
 */
async function blacklistToken(jti, ttlSeconds) {
    const redis = (0, redis_1.getRedisClient)();
    if (!redis || !jti || ttlSeconds <= 0) {
        return;
    }
    await redis.set(blacklistKey(jti), "1", "EX", ttlSeconds);
}
async function isTokenBlacklisted(jti) {
    const redis = (0, redis_1.getRedisClient)();
    if (!redis) {
        return false;
    }
    // BUG FIX (found live on-device 2026-09-20): this used to let a Redis failure propagate into
    // `authenticate`, whose catch answers 401 — so a transient Upstash blip turned every valid
    // token into "unauthorized" and the mobile apps' 401 handling logged the shopkeeper out
    // mid-shift. Observed on the shop app twice: four concurrent requests each took exactly
    // 5004ms (the REST client's AbortSignal.timeout) and returned 401, while a genuinely bad
    // token rejects in ~4ms.
    //
    // The blacklist is a revocation *optimisation* on top of a cryptographically verified JWT,
    // not the source of truth for whether the token is valid. When it can't be consulted, failing
    // open keeps sessions alive; the cost is that a token revoked in the last few minutes may stay
    // usable until its own expiry, which is a far smaller harm than logging out every shop
    // whenever Redis hiccups.
    try {
        const value = await redis.get(blacklistKey(jti));
        return value !== null;
    }
    catch (error) {
        console.warn("[auth] Token blacklist unavailable — allowing the request through", error);
        return false;
    }
}
