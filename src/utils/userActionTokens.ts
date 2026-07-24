import crypto from "node:crypto";
import { UserActionTokenPurpose } from "@prisma/client";

import { env } from "../config/env";
import type { DbClient } from "../types/prisma";
import { renderActionLinkEmail, sendMail } from "./mailer";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getAppBaseUrl() {
  const candidateOrigins = env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of candidateOrigins) {
    try {
      return new URL(origin).toString().replace(/\/+$/, "");
    } catch {
      continue;
    }
  }

  throw new Error("CORS_ORIGIN must contain at least one valid absolute URL");
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

const ACTION_LINK_COPY: Record<
  UserActionTokenPurpose,
  { pathname: string; heading: string; intro: string; actionLabel: string }
> = {
  [UserActionTokenPurpose.ACCOUNT_SETUP]: {
    pathname: "/account-setup",
    heading: "Set up your NearCart Inventory account",
    intro: "You've been invited to NearCart Inventory. Click below to set your password and activate your account.",
    actionLabel: "Set up account",
  },
  [UserActionTokenPurpose.PASSWORD_RESET]: {
    pathname: "/reset-password",
    heading: "Reset your NearCart Inventory password",
    intro: "We received a request to reset your password. Click below to choose a new one.",
    actionLabel: "Reset password",
  },
};

/**
 * Emails the given user their account-setup/password-reset link. The raw token/url is
 * intentionally NOT returned to callers — it must only ever reach the intended user's inbox.
 * See CLAUDE.md / PHASE1_REQUIREMENTS.md: returning this in an API response is the security hole
 * this function replaces.
 */
export async function sendUserActionEmail(input: {
  to: string;
  purpose: UserActionTokenPurpose;
  rawToken: string;
  expiresAt: Date;
}) {
  const copy = ACTION_LINK_COPY[input.purpose];
  const url = buildUserActionLink(copy.pathname, input.rawToken);
  const { html, text } = renderActionLinkEmail({
    heading: copy.heading,
    intro: copy.intro,
    actionLabel: copy.actionLabel,
    url,
    expiresAt: input.expiresAt,
  });

  await sendMail({
    to: input.to,
    subject: copy.heading,
    html,
    text,
  });
}
