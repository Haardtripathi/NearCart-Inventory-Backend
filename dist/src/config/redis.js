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
class UpstashRestRedisClient {
    restUrl;
    restToken;
    keyPrefix;
    status = "end";
    constructor(restUrl, restToken, keyPrefix) {
        this.restUrl = restUrl;
        this.restToken = restToken;
        this.keyPrefix = keyPrefix;
    }
    normalizeKey(key) {
        return `${this.keyPrefix}:${key}`;
    }
    async runCommand(command, args = []) {
        const payload = [command.toUpperCase(), ...args.map((value) => String(value))];
        const response = await fetch(this.restUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.restToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000),
        });
        const data = (await response.json().catch(() => null));
        if (!response.ok) {
            const errorMessage = typeof data === "object" && data && "error" in data && typeof data.error === "string"
                ? data.error
                : `Upstash REST request failed with status ${response.status}`;
            throw new Error(errorMessage);
        }
        if (typeof data === "object" && data && "error" in data && typeof data.error === "string") {
            throw new Error(data.error);
        }
        if (typeof data === "object" && data && "result" in data) {
            return data.result;
        }
        return data;
    }
    async get(key) {
        const value = await this.runCommand("GET", [this.normalizeKey(key)]);
        return typeof value === "string" ? value : null;
    }
    async set(key, value, mode, ttlSeconds) {
        const args = [this.normalizeKey(key), value];
        if (mode === "EX" && ttlSeconds) {
            args.push("EX", ttlSeconds);
        }
        const result = await this.runCommand("SET", args);
        return result === "OK" ? "OK" : null;
    }
    async call(command, ...args) {
        return this.runCommand(command, args);
    }
    async connect() {
        this.status = "connecting";
        await this.runCommand("PING");
        this.status = "ready";
    }
    async quit() {
        this.status = "end";
    }
}
class IoredisClientAdapter {
    client;
    constructor(client) {
        this.client = client;
    }
    get status() {
        if (this.client.status === "ready") {
            return "ready";
        }
        if (this.client.status === "connecting") {
            return "connecting";
        }
        return "end";
    }
    async get(key) {
        return this.client.get(key);
    }
    async set(key, value, mode, ttlSeconds) {
        if (mode === "EX" && ttlSeconds) {
            return this.client.set(key, value, mode, ttlSeconds);
        }
        return this.client.set(key, value);
    }
    async call(command, ...args) {
        return this.client.call(command, ...args.map((value) => String(value)));
    }
    async connect() {
        await this.client.connect();
    }
    async quit() {
        await this.client.quit();
    }
}
let configuredRedisClient = null;
let readyRedisClient = null;
if (env_1.env.REDIS_URL) {
    const client = new ioredis_1.default(env_1.env.REDIS_URL, {
        lazyConnect: true,
        keyPrefix: `${env_1.env.REDIS_KEY_PREFIX}:`,
        maxRetriesPerRequest: 2,
    });
    client.on("error", (error) => {
        console.error("Redis client error", error);
    });
    configuredRedisClient = new IoredisClientAdapter(client);
}
else if (env_1.env.UPSTASH_REDIS_REST_URL && env_1.env.UPSTASH_REDIS_REST_TOKEN) {
    configuredRedisClient = new UpstashRestRedisClient(env_1.env.UPSTASH_REDIS_REST_URL, env_1.env.UPSTASH_REDIS_REST_TOKEN, env_1.env.REDIS_KEY_PREFIX);
}
function getRedisClient() {
    return readyRedisClient;
}
async function connectRedis() {
    if (!configuredRedisClient) {
        return;
    }
    if (readyRedisClient?.status === "ready") {
        return;
    }
    try {
        await configuredRedisClient.connect();
        readyRedisClient = configuredRedisClient;
    }
    catch (error) {
        readyRedisClient = null;
        try {
            await configuredRedisClient.quit();
        }
        catch {
            // Ignore cleanup failures after an unsuccessful connect attempt.
        }
        configuredRedisClient = null;
        throw error;
    }
}
async function disconnectRedis() {
    if (!configuredRedisClient) {
        return;
    }
    await configuredRedisClient.quit();
    readyRedisClient = null;
}
