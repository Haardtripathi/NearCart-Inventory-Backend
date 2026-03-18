import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";

import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";

export async function requireOrganizationContext(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    return next(ApiError.unauthorized());
  }

  const headerOrgId =
    typeof req.headers["x-organization-id"] === "string" ? req.headers["x-organization-id"] : undefined;
  const organizationId = headerOrgId ?? req.auth.activeOrganizationId;

  if (!organizationId) {
    return next(ApiError.badRequest("Organization context is required"));
  }

  if (req.auth.role === UserRole.SUPER_ADMIN) {
    const organization = await prisma.organization.findFirst({
      where: {
        id: organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        defaultLanguage: true,
        enabledLanguages: true,
      },
    });

    if (!organization) {
      return next(ApiError.notFound("Organization not found"));
    }

    req.activeOrganization = organization;
    req.auth = {
      ...req.auth,
      activeOrganizationId: organizationId,
      activeOrganizationDefaultLanguage: organization.defaultLanguage,
    };

    return next();
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId: req.auth.userId,
      organizationId,
      organization: {
        deletedAt: null,
      },
      user: {
        isActive: true,
      },
    },
    include: {
      organization: {
        select: {
          id: true,
          defaultLanguage: true,
          enabledLanguages: true,
        },
      },
    },
  });

  if (!membership) {
    return next(ApiError.forbidden("You do not belong to the selected organization"));
  }

  req.membership = membership;
  req.activeOrganization = membership.organization;
  req.auth = {
    ...req.auth,
    activeOrganizationId: organizationId,
    role: membership.role,
    activeOrganizationDefaultLanguage: membership.organization.defaultLanguage,
  };

  next();
}
