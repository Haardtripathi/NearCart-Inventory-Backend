"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestMeta = getRequestMeta;
exports.normalizeOptionalString = normalizeOptionalString;
exports.normalizeNullableString = normalizeNullableString;
function getRequestMeta(req) {
    const ipAddress = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
        req.socket.remoteAddress ??
        null;
    return {
        ipAddress,
        userAgent: req.headers["user-agent"] ?? null,
    };
}
function normalizeOptionalString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
}
function normalizeNullableString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
}
