import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import { getRedisClient } from "../config/redis";
import { env } from "../config/env";

const redis = getRedisClient();
const passThroughRateLimiter: RequestHandler = (_req, _res, next) => {
  next();
};

export const apiRateLimiter =
  env.NODE_ENV === "development"
    ? passThroughRateLimiter
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 300,
        standardHeaders: true,
        legacyHeaders: false,
        ...(redis
          ? {
              store: new RedisStore({
                sendCommand: async (...args: string[]) => {
                  const [command, ...rest] = args;

                  if (!command) {
                    return null as unknown as number;
                  }

                  return redis.call(command, ...rest) as Promise<number>;
                },
              }),
            }
          : {}),
      });
