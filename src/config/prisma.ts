import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient__: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaLibSql({
    url: env.DATABASE_URL,
    ...(env.DATABASE_AUTH_TOKEN ? { authToken: env.DATABASE_AUTH_TOKEN } : {}),
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["query", "info", "warn", "error"] : ["warn", "error"],
  });
}

const prismaClient = global.__prismaClient__ ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  global.__prismaClient__ = prismaClient;
}

export const prisma = prismaClient;
