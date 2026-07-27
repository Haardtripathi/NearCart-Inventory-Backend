import crypto from "node:crypto";

import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

/**
 * Mirrors NearCart/backend's RefreshToken design (rotate-on-use, hashed storage, soft-revoke) —
 * Driver previously had only a flat non-rotating JWT with no refresh mechanism at all, which
 * can't safely support a months-long session. Same hashing approach as utils/userActionTokens.ts
 * (sha256 of a high-entropy random value; these are opaque bearer tokens, not passwords, so a
 * fast deterministic hash is the right tool — bcrypt's deliberate slowness buys nothing here and
 * would make every refresh call noticeably slower).
 */
function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createRawToken() {
  return crypto.randomBytes(40).toString("hex");
}

/** Issues a brand-new rotating refresh session for a driver (called at login). */
export async function createDriverRefreshSession(driverId: string): Promise<string> {
  const rawToken = createRawToken();
  const expiresAt = new Date(Date.now() + env.DRIVER_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.driverRefreshToken.create({
    data: {
      driverId,
      tokenHash: hashToken(rawToken),
      expiresAt,
    },
  });

  return rawToken;
}

/**
 * Validates a raw refresh token, revokes it, and issues a new one in its place (rotation) —
 * returning both the driverId to re-issue an access token for and the new raw refresh token.
 * Throws ApiError.unauthorized for any invalid/expired/already-revoked/reused token, matching the
 * shared-secret-style resilience the rest of this backend uses for auth failures.
 */
export async function rotateDriverRefreshSession(
  rawToken: string,
): Promise<{ driverId: string; refreshToken: string }> {
  const tokenHash = hashToken(rawToken);

  const existing = await prisma.driverRefreshToken.findUnique({ where: { tokenHash } });

  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    throw ApiError.unauthorized("Refresh token is invalid or has expired");
  }

  const refreshToken = await prisma.$transaction(async (tx) => {
    await tx.driverRefreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const rawReplacement = createRawToken();
    const expiresAt = new Date(Date.now() + env.DRIVER_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    await tx.driverRefreshToken.create({
      data: {
        driverId: existing.driverId,
        tokenHash: hashToken(rawReplacement),
        expiresAt,
      },
    });

    return rawReplacement;
  });

  return { driverId: existing.driverId, refreshToken };
}

/** Revokes a single refresh token (logout). No-ops silently on an already-invalid token. */
export async function revokeDriverRefreshSession(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);

  await prisma.driverRefreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
