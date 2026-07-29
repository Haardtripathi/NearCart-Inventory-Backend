"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDriverRefreshSession = createDriverRefreshSession;
exports.rotateDriverRefreshSession = rotateDriverRefreshSession;
exports.revokeDriverRefreshSession = revokeDriverRefreshSession;
const node_crypto_1 = __importDefault(require("node:crypto"));
const prisma_1 = require("../config/prisma");
const env_1 = require("../config/env");
const ApiError_1 = require("../utils/ApiError");
/**
 * Mirrors NearCart/backend's RefreshToken design (rotate-on-use, hashed storage, soft-revoke) —
 * Driver previously had only a flat non-rotating JWT with no refresh mechanism at all, which
 * can't safely support a months-long session. Same hashing approach as utils/userActionTokens.ts
 * (sha256 of a high-entropy random value; these are opaque bearer tokens, not passwords, so a
 * fast deterministic hash is the right tool — bcrypt's deliberate slowness buys nothing here and
 * would make every refresh call noticeably slower).
 */
function hashToken(token) {
    return node_crypto_1.default.createHash("sha256").update(token).digest("hex");
}
function createRawToken() {
    return node_crypto_1.default.randomBytes(40).toString("hex");
}
/** Issues a brand-new rotating refresh session for a driver (called at login). */
async function createDriverRefreshSession(driverId) {
    const rawToken = createRawToken();
    const expiresAt = new Date(Date.now() + env_1.env.DRIVER_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
    await prisma_1.prisma.driverRefreshToken.create({
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
async function rotateDriverRefreshSession(rawToken) {
    const tokenHash = hashToken(rawToken);
    const existing = await prisma_1.prisma.driverRefreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
        throw ApiError_1.ApiError.unauthorized("Refresh token is invalid or has expired");
    }
    const refreshToken = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.driverRefreshToken.update({
            where: { id: existing.id },
            data: { revokedAt: new Date() },
        });
        const rawReplacement = createRawToken();
        const expiresAt = new Date(Date.now() + env_1.env.DRIVER_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
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
async function revokeDriverRefreshSession(rawToken) {
    const tokenHash = hashToken(rawToken);
    await prisma_1.prisma.driverRefreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
    });
}
