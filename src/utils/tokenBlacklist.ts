import { getRedisClient } from "../config/redis";

function blacklistKey(jti: string) {
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
export async function blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();

  if (!redis || !jti || ttlSeconds <= 0) {
    return;
  }

  await redis.set(blacklistKey(jti), "1", "EX", ttlSeconds);
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const redis = getRedisClient();

  if (!redis) {
    return false;
  }

  const value = await redis.get(blacklistKey(jti));
  return value !== null;
}
