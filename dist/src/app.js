"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("./config/env");
const error_middleware_1 = require("./middlewares/error.middleware");
const notFound_middleware_1 = require("./middlewares/notFound.middleware");
const rateLimit_middleware_1 = require("./middlewares/rateLimit.middleware");
const routes_1 = require("./routes");
exports.app = (0, express_1.default)();
if (env_1.env.NODE_ENV === "production") {
    // Render and similar platforms terminate TLS at a proxy and set X-Forwarded-For.
    exports.app.set("trust proxy", 1);
}
const configuredCorsOrigins = env_1.env.CORS_ORIGIN.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((origin) => /^https?:\/\//i.test(origin) ? origin : `http://${origin}`);
// Any localhost/127.0.0.1 port, not just the frontend's usual 5173-5175 — dev tooling (Expo web
// preview, Playwright, etc.) binds to arbitrary ports, and a hardcoded port list here previously
// CORS-blocked anything not on that exact list even though this only ever runs in development.
// Mirrors NearCart/backend's src/config/cors.ts, which already solved this the same way.
const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
exports.app.use((0, helmet_1.default)());
exports.app.use((0, cors_1.default)({
    origin(origin, callback) {
        const isAllowedLocalOrigin = env_1.env.NODE_ENV !== "production" && localOriginPattern.test(origin ?? "");
        if (!origin || configuredCorsOrigins.includes(origin) || isAllowedLocalOrigin) {
            callback(null, true);
            return;
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
}));
// Only log API traffic. The server is on a public IP, so internet-wide scanners (e.g. bots
// brute-forcing Synology NAS logins at /webapi/entry.cgi) flood the log with 404s.
exports.app.use((0, morgan_1.default)(env_1.env.NODE_ENV === "production" ? "combined" : "dev", {
    skip: (request) => !request.originalUrl.startsWith("/api"),
}));
exports.app.use(express_1.default.json({ limit: "2mb" }));
exports.app.use(rateLimit_middleware_1.apiRateLimiter);
exports.app.use("/api", routes_1.apiRouter);
exports.app.use(notFound_middleware_1.notFoundMiddleware);
exports.app.use(error_middleware_1.errorMiddleware);
