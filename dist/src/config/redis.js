"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisClient = getRedisClient;
exports.connectRedis = connectRedis;
exports.disconnectRedis = disconnectRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("./env");
let redisClient = null;
if (env_1.env.REDIS_URL) {
    redisClient = new ioredis_1.default(env_1.env.REDIS_URL, {
        lazyConnect: true,
        keyPrefix: `${env_1.env.REDIS_KEY_PREFIX}:`,
        maxRetriesPerRequest: 2,
    });
    redisClient.on("error", (error) => {
        console.error("Redis client error", error);
    });
}
function getRedisClient() {
    return redisClient;
}
async function connectRedis() {
    if (!redisClient) {
        return;
    }
    if (redisClient.status === "ready" || redisClient.status === "connecting") {
        return;
    }
    await redisClient.connect();
}
async function disconnectRedis() {
    if (!redisClient) {
        return;
    }
    await redisClient.quit();
}
