"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireInternalServiceAuth = requireInternalServiceAuth;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
const ApiError_1 = require("../utils/ApiError");
// Constant-time comparison for the shared internal-service secret — a plain `!==` here leaks
// timing information proportional to the matching-prefix length. NearCart's mirror of this same
// middleware (backend/src/middleware/internalService.ts) already uses crypto.timingSafeEqual;
// this brings the two sides in line. Falls back to `false` on a length mismatch since
// timingSafeEqual requires equal-length buffers.
function timingSafeEqualStrings(a, b) {
    const bufferA = Buffer.from(a, "utf8");
    const bufferB = Buffer.from(b, "utf8");
    if (bufferA.length !== bufferB.length) {
        return false;
    }
    return crypto_1.default.timingSafeEqual(bufferA, bufferB);
}
function readInternalToken(req) {
    const headerToken = req.headers["x-internal-service-token"];
    if (typeof headerToken === "string" && headerToken.trim().length > 0) {
        return headerToken.trim();
    }
    const authorization = req.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
        const bearerToken = authorization.slice(7).trim();
        if (bearerToken.length > 0) {
            return bearerToken;
        }
    }
    return null;
}
function requireInternalServiceAuth(req, _res, next) {
    const configuredToken = env_1.env.MARKETPLACE_INTERNAL_TOKEN?.trim();
    if (!configuredToken) {
        return next(new ApiError_1.ApiError(500, "Marketplace internal token is not configured"));
    }
    const providedToken = readInternalToken(req);
    if (!providedToken || !timingSafeEqualStrings(providedToken, configuredToken)) {
        return next(ApiError_1.ApiError.forbidden("Invalid internal service token"));
    }
    next();
}
