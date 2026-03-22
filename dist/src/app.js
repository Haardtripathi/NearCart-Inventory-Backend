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
const corsOrigins = env_1.env.CORS_ORIGIN.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((origin) => /^https?:\/\//i.test(origin) ? origin : `http://${origin}`);
exports.app.use((0, helmet_1.default)());
exports.app.use((0, cors_1.default)({
    origin: corsOrigins,
    credentials: true,
}));
exports.app.use((0, morgan_1.default)(env_1.env.NODE_ENV === "production" ? "combined" : "dev"));
exports.app.use(express_1.default.json({ limit: "2mb" }));
exports.app.use(rateLimit_middleware_1.apiRateLimiter);
exports.app.use("/api", routes_1.apiRouter);
exports.app.use(notFound_middleware_1.notFoundMiddleware);
exports.app.use(error_middleware_1.errorMiddleware);
