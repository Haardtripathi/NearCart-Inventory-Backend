import type { Request } from "express";

export function getRequestMeta(req: Request) {
  const ipAddress =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    null;

  return {
    ipAddress,
    userAgent: req.headers["user-agent"] ?? null,
  };
}

export function normalizeOptionalString(value: string | undefined | null) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function normalizeNullableString(value: string | undefined | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
