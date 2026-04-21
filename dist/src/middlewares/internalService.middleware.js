"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireInternalServiceAuth = requireInternalServiceAuth;
const env_1 = require("../config/env");
const ApiError_1 = require("../utils/ApiError");
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
    if (!providedToken || providedToken !== configuredToken) {
        return next(ApiError_1.ApiError.forbidden("Invalid internal service token"));
    }
    next();
}
