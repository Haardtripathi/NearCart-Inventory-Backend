import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

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

  if (!providedToken || providedToken !== configuredToken) {
    return next(ApiError.forbidden("Invalid internal service token"));
  }

  next();
}
