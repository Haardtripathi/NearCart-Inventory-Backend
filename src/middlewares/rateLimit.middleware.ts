import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import { getRedisClient } from "../config/redis";

const redis = getRedisClient();

export const apiRateLimiter = rateLimit({
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
