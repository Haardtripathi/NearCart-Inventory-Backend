import { AuditAction, UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { signAuthToken } from "../../utils/jwt";
import type { JwtAuthPayload } from "../../types/auth";
import { createAuditLog } from "../audit/audit.service";

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface BootstrapSuperAdminInput {
  secret: string;
  fullName: string;
  email: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
  organizationId?: string;
}

function buildTokenPayload(input: JwtAuthPayload) {
  return signAuthToken(input);
}

export async function bootstrapSuperAdmin(input: BootstrapSuperAdminInput, meta: RequestMeta) {
  if (input.secret !== env.ADMIN_BOOTSTRAP_SECRET) {
    throw ApiError.unauthorized("Invalid bootstrap secret");
  }

  const existingSuperAdmin = await prisma.user.findFirst({
    where: {
      platformRole: UserRole.SUPER_ADMIN,
    },
    select: { id: true },
  });

  if (existingSuperAdmin) {
    throw ApiError.conflict("Super admin already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash,
      platformRole: UserRole.SUPER_ADMIN,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      platformRole: true,
      preferredLanguage: true,
      createdAt: true,
    },
  });

  await createAuditLog(prisma, {
    actorUserId: user.id,
    action: AuditAction.CREATE,
    entityType: "User",
    entityId: user.id,
    after: user,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return user;
}

export async function login(input: LoginInput, meta: RequestMeta) {
  const user = await prisma.user.findUnique({
    where: {
      email: input.email.trim().toLowerCase(),
    },
    include: {
      memberships: {
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              deletedAt: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!user || !user.isActive) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

  if (!passwordMatches) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const activeMemberships = user.memberships.filter((membership) => membership.organization.deletedAt === null);

  let activeOrganizationId: string | null = null;
  let role: UserRole | null = user.platformRole === UserRole.SUPER_ADMIN ? UserRole.SUPER_ADMIN : null;

  if (user.platformRole !== UserRole.SUPER_ADMIN) {
    const membership =
      (input.organizationId
        ? activeMemberships.find((item) => item.organizationId === input.organizationId)
        : activeMemberships.find((item) => item.isDefault) ?? activeMemberships[0]) ?? null;

    if (!membership) {
      throw ApiError.forbidden("No organization membership found for this user");
    }

    activeOrganizationId = membership.organizationId;
    role = membership.role;
  }

  if (role === null) {
    throw ApiError.forbidden("Unable to determine role for this user");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = buildTokenPayload({
    userId: user.id,
    activeOrganizationId,
    role,
  });

  await createAuditLog(prisma, {
    organizationId: activeOrganizationId,
    actorUserId: user.id,
    action: AuditAction.LOGIN,
    entityType: "User",
    entityId: user.id,
    meta: {
      activeOrganizationId,
      role,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      platformRole: user.platformRole,
      preferredLanguage: user.preferredLanguage,
      lastLoginAt: user.lastLoginAt,
    },
    activeOrganizationId,
    role,
    memberships: activeMemberships.map((membership) => ({
      id: membership.id,
      organizationId: membership.organizationId,
      role: membership.role,
      isDefault: membership.isDefault,
      organization: membership.organization,
    })),
  };
}

export async function getMe(userId: string, activeOrganizationId: string | null, role: UserRole) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!user) {
    throw ApiError.notFound("User not found");
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    isActive: user.isActive,
    platformRole: user.platformRole,
    preferredLanguage: user.preferredLanguage,
    activeOrganizationId,
    role,
    memberships: user.memberships.map((membership) => ({
      id: membership.id,
      organizationId: membership.organizationId,
      role: membership.role,
      isDefault: membership.isDefault,
      branchAccess: membership.branchAccess,
      organization: membership.organization,
    })),
  };
}
