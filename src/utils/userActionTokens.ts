import crypto from "node:crypto";
import { UserActionTokenPurpose } from "@prisma/client";

import { env } from "../config/env";
import type { DbClient } from "../types/prisma";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getAppBaseUrl() {
  return env.CORS_ORIGIN.replace(/\/+$/, "");
}

export function buildUserActionLink(pathname: string, token: string) {
  const url = new URL(pathname, `${getAppBaseUrl()}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function createUserActionToken(
  db: DbClient,
  input: {
    userId: string;
    purpose: UserActionTokenPurpose;
    organizationId?: string | null;
    createdByUserId?: string | null;
    expiresInHours: number;
    metadata?: unknown;
  },
) {
  const rawToken = createRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);

  await db.userActionToken.deleteMany({
    where: {
      userId: input.userId,
      purpose: input.purpose,
      organizationId: input.organizationId ?? null,
      usedAt: null,
    },
  });

  const record = await db.userActionToken.create({
    data: {
      userId: input.userId,
      purpose: input.purpose,
      organizationId: input.organizationId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      expiresAt,
      tokenHash,
      metadata: input.metadata as never,
    },
  });

  return {
    rawToken,
    record,
  };
}

export async function getUserActionTokenByRawToken(
  db: DbClient,
  rawToken: string,
  purpose: UserActionTokenPurpose,
) {
  const tokenHash = hashToken(rawToken);

  return db.userActionToken.findFirst({
    where: {
      tokenHash,
      purpose,
      usedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          defaultLanguage: true,
        },
      },
    },
  });
}

export async function markUserActionTokenUsed(db: DbClient, tokenId: string) {
  return db.userActionToken.update({
    where: { id: tokenId },
    data: {
      usedAt: new Date(),
    },
  });
}
