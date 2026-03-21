"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rate_limit_redis_1 = require("rate-limit-redis");
const redis_1 = require("../config/redis");
const redis = (0, redis_1.getRedisClient)();
exports.apiRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    ...(redis
        ? {
            store: new rate_limit_redis_1.RedisStore({
                sendCommand: async (...args) => {
                    const [command, ...rest] = args;
                    if (!command) {
                        return null;
                    }
                    return redis.call(command, ...rest);
                },
            }),
        }
        : {}),
});
