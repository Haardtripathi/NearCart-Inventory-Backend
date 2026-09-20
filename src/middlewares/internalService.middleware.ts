import crypto from "crypto";

import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

// Constant-time comparison for the shared internal-service secret — a plain `!==` here leaks
// timing information proportional to the matching-prefix length. NearCart's mirror of this same
// middleware (backend/src/middleware/internalService.ts) already uses crypto.timingSafeEqual;
// this brings the two sides in line. Falls back to `false` on a length mismatch since
// timingSafeEqual requires equal-length buffers.
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
}

function readInternalToken(req: Request) {
  const headerToken = req.headers["x-internal-service-token"];

  if (typeof headerToken === "string" && headerToken.trim().length > 0) {
    return headerToken.trim();
  }

  const authorization = req.headers.authorization;

  if (authorization?.startsWith("Bearer ")) {
    const bearerToken = authorization.slice(7).trim();

    if (bearerToken.length > 0) {
      return bearerToken;
    }
  }

  return null;
}

export function requireInternalServiceAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const configuredToken = env.MARKETPLACE_INTERNAL_TOKEN?.trim();

  if (!configuredToken) {
    return next(new ApiError(500, "Marketplace internal token is not configured"));
  }

  const providedToken = readInternalToken(req);

  if (!providedToken || !timingSafeEqualStrings(providedToken, configuredToken)) {
    return next(ApiError.forbidden("Invalid internal service token"));
  }

  next();
}
