import Redis from "ioredis";

import { env } from "./env";

let redisClient: Redis | null = null;

if (env.REDIS_URL) {
  redisClient = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    keyPrefix: `${env.REDIS_KEY_PREFIX}:`,
    maxRetriesPerRequest: 2,
  });

  redisClient.on("error", (error) => {
    console.error("Redis client error", error);
  });
}

export function getRedisClient() {
  return redisClient;
}

export async function connectRedis() {
  if (!redisClient) {
    return;
  }

  if (redisClient.status === "ready" || redisClient.status === "connecting") {
    return;
  }

  await redisClient.connect();
}

export async function disconnectRedis() {
  if (!redisClient) {
    return;
  }

  await redisClient.quit();
}
