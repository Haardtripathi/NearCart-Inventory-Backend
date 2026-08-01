import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";

import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { verifyAuthToken } from "../utils/jwt";
import { isTokenBlacklisted } from "../utils/tokenBlacklist";

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing or invalid authorization header"));
  }

  try {
    const token = authorization.replace("Bearer ", "").trim();
    const payload = verifyAuthToken(token);

    // Driver tokens are signed with this same JWT_SECRET (see utils/driverJwt.ts) but carry a
    // `driverId`/`type: "driver"` payload instead of `userId` — reject explicitly rather than
    // relying on Prisma's implicit rejection of an `undefined` unique-where value, so a driver
    // token can never be mistaken for a user token even if that incidental behavior changes.
    if (!payload || typeof payload.userId !== "string" || !payload.userId) {
      throw ApiError.unauthorized("Invalid or expired token");
    }

    // `jti` only exists on tokens minted after the logout fix (see utils/jwt.ts) — a token
    // minted before that deploy has no jti to check and simply can't be revoked early, same as
    // its pre-fix behavior. Nothing to do for those; they just fall through to expiry as before.
    if (payload.jti && (await isTokenBlacklisted(payload.jti))) {
      throw ApiError.unauthorized("Session has been logged out");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        isActive: true,
        platformRole: true,
        preferredLanguage: true,
      },
    });

    if (!user || !user.isActive) {
      throw ApiError.unauthorized("User is inactive or does not exist");
    }

    req.auth = {
      userId: payload.userId,
      activeOrganizationId: payload.activeOrganizationId,
      role: user.platformRole === UserRole.SUPER_ADMIN ? UserRole.SUPER_ADMIN : payload.role,
      userPreferredLanguage: user.preferredLanguage,
      activeOrganizationDefaultLanguage: null,
      tokenJti: payload.jti ?? "",
      tokenExpiresAt: payload.exp ?? 0,
    };

    next();
  } catch (error) {
    next(error instanceof ApiError ? error : ApiError.unauthorized("Invalid or expired token"));
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(ApiError.unauthorized());
    }

    if (!roles.includes(req.auth.role)) {
      return next(ApiError.forbidden("You do not have access to this resource"));
    }

    next();
  };
}

/**
 * Gates a "key action" behind email verification (see auth.service.ts login()/sendEmailVerificationOtp).
 * SUPER_ADMIN is always exempt (bootstrap account, never goes through OTP). Apply to specific
 * sensitive write routes rather than globally — most invited users are already verified by the
 * time they can log in at all (see completeCredentialFlow), so this mainly targets self-registered
 * org owners who skipped OTP verification.
 */
export async function requireEmailVerified(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    return next(ApiError.unauthorized());
  }

  if (req.auth.role === UserRole.SUPER_ADMIN) {
    return next();
  }

  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    select: { emailVerified: true },
  });

  if (!user?.emailVerified) {
    return next(ApiError.forbidden("Please verify your email before performing this action"));
  }

  next();
}
