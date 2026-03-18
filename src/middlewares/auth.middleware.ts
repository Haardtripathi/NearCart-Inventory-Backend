import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";

import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { verifyAuthToken } from "../utils/jwt";

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing or invalid authorization header"));
  }

  try {
    const token = authorization.replace("Bearer ", "").trim();
    const payload = verifyAuthToken(token);

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
