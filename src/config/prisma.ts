import { PrismaClient } from "@prisma/client";

import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient__: PrismaClient | undefined;
}

const prismaClient =
  global.__prismaClient__ ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["query", "info", "warn", "error"] : ["warn", "error"],
  });

if (env.NODE_ENV !== "production") {
  global.__prismaClient__ = prismaClient;
}

export const prisma = prismaClient;
