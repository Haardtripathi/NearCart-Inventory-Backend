import {
  AuditAction,
  LanguageCode,
  MembershipStatus,
  UserActionTokenPurpose,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcrypt";

import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import type { JwtAuthPayload } from "../../types/auth";
import { ApiError } from "../../utils/ApiError";
import { normalizeBranchAccess } from "../../utils/branchAccess";
import { syncEntityFieldTranslations } from "../../utils/entityFieldTranslations";
import { signAuthToken } from "../../utils/jwt";
import { createLocaleContext, type LocaleContext, serializeLocalizedEntity } from "../../utils/localization";
import {
  getUserActionTokenByRawToken,
  markUserActionTokenUsed,
} from "../../utils/userActionTokens";
import { assertIndustryExists } from "../../utils/guards";
import {
  createOrganizationWithResolvedOwner,
  type CreateOrganizationInput,
} from "../organizations/organizations.service";
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

interface RegisterOrganizationOwnerInput {
  fullName: string;
  email: string;
  password: string;
  preferredLanguage?: LanguageCode;
  name: string;
  slug?: string;
  legalName?: string;
  phone?: string;
  organizationEmail?: string;
  currencyCode?: string;
  timezone?: string;
  defaultLanguage?: LanguageCode;
  enabledLanguages?: LanguageCode[];
  settings?: unknown;
  primaryIndustryId: string;
  enabledFeatures?: Record<string, unknown>;
  customSettings?: unknown;
  firstBranch: CreateOrganizationInput["firstBranch"];
}

interface ActionTokenPasswordInput {
  token: string;
  password: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

interface UpdatePreferencesInput {
  preferredLanguage: LanguageCode;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildTokenPayload(input: JwtAuthPayload) {
  return signAuthToken(input);
}

function serializeMemberships(
  memberships: Array<{
    id: string;
    organizationId: string;
    role: UserRole;
    isDefault: boolean;
    branchAccess: unknown;
    organization: {
      id: string;
      name: string;
      slug: string;
      email: string | null;
      status: string;
      defaultLanguage: LanguageCode;
      industryConfigs: Array<{
        id: string;
        industryId: string;
        isPrimary: boolean;
        industry: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          isActive: boolean;
          defaultFeatures: unknown;
          defaultSettings: unknown;
          translations: Array<{
            language: LanguageCode;
            name: string;
            description: string | null;
          }>;
        };
      }>;
    };
  }>,
  localeContext: LocaleContext,
) {
  return memberships.map((membership) => ({
    id: membership.id,
    organizationId: membership.organizationId,
    role: membership.role,
    isDefault: membership.isDefault,
    branchAccess: normalizeBranchAccess(membership.branchAccess),
    organization: {
      ...membership.organization,
      industries: membership.organization.industryConfigs.map((config) => ({
        ...config,
        industry: serializeLocalizedEntity(
          config.industry,
          createLocaleContext({
            requestedLanguage: localeContext.requestedLanguage,
            userPreferredLanguage: localeContext.userPreferredLanguage,
            orgDefaultLanguage: membership.organization.defaultLanguage,
          }),
        ),
      })),
    },
  }));
}

async function buildAuthenticatedSession(
  userId: string,
  requestedOrganizationId?: string | null,
  localeContext?: LocaleContext,
) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    include: {
      memberships: {
        where: {
          status: MembershipStatus.ACTIVE,
          organization: {
            deletedAt: null,
          },
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              email: true,
              status: true,
              defaultLanguage: true,
              industryConfigs: {
                include: {
                  industry: {
                    include: {
                      translations: {
                        orderBy: {
                          language: "asc",
                        },
                      },
                    },
                  },
                },
              },
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
    throw ApiError.unauthorized("User is inactive or does not exist");
  }

  let activeOrganizationId: string | null = null;
  let role: UserRole | null = user.platformRole === UserRole.SUPER_ADMIN ? UserRole.SUPER_ADMIN : null;

  if (user.platformRole !== UserRole.SUPER_ADMIN) {
    const membership =
      (requestedOrganizationId
        ? user.memberships.find((item) => item.organizationId === requestedOrganizationId)
        : user.memberships.find((item) => item.isDefault) ?? user.memberships[0]) ?? null;

    if (!membership) {
      throw ApiError.forbidden("No active organization membership found for this user");
    }

    activeOrganizationId = membership.organizationId;
    role = membership.role;
  }

  if (!role) {
    throw ApiError.forbidden("Unable to determine role for this user");
  }

  const resolvedLocaleContext =
    localeContext ??
    createLocaleContext({
      userPreferredLanguage: user.preferredLanguage,
    });

  const token = buildTokenPayload({
    userId: user.id,
    activeOrganizationId,
    role,
  });

  return {
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      platformRole: user.platformRole,
      preferredLanguage: user.preferredLanguage,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    },
    activeOrganizationId,
    role,
    memberships: serializeMemberships(user.memberships, resolvedLocaleContext),
  };
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
      email: normalizeEmail(input.email),
      passwordHash,
      platformRole: UserRole.SUPER_ADMIN,
      passwordSetupRequired: false,
      passwordChangedAt: new Date(),
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

  await syncEntityFieldTranslations(prisma, {
    entityType: "User",
    entityId: user.id,
    fields: [{ fieldKey: "fullName", value: input.fullName }],
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

export async function login(input: LoginInput, meta: RequestMeta, localeContext?: LocaleContext) {
  const user = await prisma.user.findUnique({
    where: {
      email: normalizeEmail(input.email),
    },
    select: {
      id: true,
      isActive: true,
      passwordHash: true,
      passwordSetupRequired: true,
    },
  });

  if (!user || !user.isActive || !user.passwordHash) {
    throw ApiError.unauthorized(
      user?.passwordSetupRequired ? "Account setup is required before login" : "Invalid email or password",
    );
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

  if (!passwordMatches) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const session = await buildAuthenticatedSession(user.id, input.organizationId ?? null, localeContext);

  await createAuditLog(prisma, {
    organizationId: session.activeOrganizationId,
    actorUserId: user.id,
    action: AuditAction.LOGIN,
    entityType: "User",
    entityId: user.id,
    meta: {
      activeOrganizationId: session.activeOrganizationId,
      role: session.role,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return session;
}

export async function registerOrganizationOwner(
  input: RegisterOrganizationOwnerInput,
  meta: RequestMeta,
  localeContext?: LocaleContext,
) {
  const email = normalizeEmail(input.email);

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    throw ApiError.conflict("An account with this email already exists");
  }

  const industry = await assertIndustryExists(prisma, input.primaryIndustryId);
  const passwordHash = await bcrypt.hash(input.password, 12);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        fullName: input.fullName.trim(),
        email,
        passwordHash,
        preferredLanguage: input.preferredLanguage ?? input.defaultLanguage ?? LanguageCode.EN,
        isActive: true,
        passwordSetupRequired: false,
        passwordChangedAt: new Date(),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        preferredLanguage: true,
        passwordHash: true,
        passwordSetupRequired: true,
      },
    });

    await syncEntityFieldTranslations(tx, {
      entityType: "User",
      entityId: user.id,
      fields: [{ fieldKey: "fullName", value: input.fullName }],
    });

    const organizationInput: CreateOrganizationInput = {
      name: input.name,
      slug: input.slug,
      legalName: input.legalName,
      phone: input.phone,
      email: input.organizationEmail,
      currencyCode: input.currencyCode,
      timezone: input.timezone,
      defaultLanguage: input.defaultLanguage,
      enabledLanguages: input.enabledLanguages,
      settings: input.settings,
      primaryIndustryId: input.primaryIndustryId,
      enabledFeatures: input.enabledFeatures,
      customSettings: input.customSettings,
      firstBranch: input.firstBranch,
    };

    const organization = await createOrganizationWithResolvedOwner(tx, organizationInput, {
      actorUserId: user.id,
      primaryIndustry: industry,
      owner: user,
      ownerRequiresAccountSetup: false,
    });

    await createAuditLog(tx, {
      actorUserId: user.id,
      organizationId: organization.organization.id,
      action: AuditAction.CREATE,
      entityType: "User",
      entityId: user.id,
      after: {
        id: user.id,
        email: user.email,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      userId: user.id,
      organizationId: organization.organization.id,
    };
  }, {
    maxWait: 10_000,
    timeout: 30_000,
  });

  await prisma.user.update({
    where: {
      id: created.userId,
    },
    data: {
      lastLoginAt: new Date(),
    },
  });

  const session = await buildAuthenticatedSession(created.userId, created.organizationId, localeContext);

  await createAuditLog(prisma, {
    organizationId: created.organizationId,
    actorUserId: created.userId,
    action: AuditAction.LOGIN,
    entityType: "User",
    entityId: created.userId,
    meta: {
      activeOrganizationId: created.organizationId,
      role: session.role,
      source: "registration",
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return session;
}

async function completeCredentialFlow(
  token: string,
  purpose: UserActionTokenPurpose,
  password: string,
  meta: RequestMeta,
  localeContext?: LocaleContext,
) {
  const tokenRecord = await getUserActionTokenByRawToken(prisma, token, purpose);

  if (!tokenRecord || !tokenRecord.user.isActive) {
    throw ApiError.unauthorized("This link is invalid or has expired");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        id: tokenRecord.userId,
      },
      data: {
        passwordHash,
        passwordSetupRequired: false,
        passwordChangedAt: now,
        lastLoginAt: now,
      },
    });

    if (purpose === UserActionTokenPurpose.ACCOUNT_SETUP) {
      await tx.organizationMembership.updateMany({
        where: {
          userId: tokenRecord.userId,
          status: MembershipStatus.INVITED,
        },
        data: {
          status: MembershipStatus.ACTIVE,
          acceptedAt: now,
        },
      });
    }

    await markUserActionTokenUsed(tx, tokenRecord.id);

    await createAuditLog(tx, {
      organizationId: tokenRecord.organizationId,
      actorUserId: tokenRecord.userId,
      action: AuditAction.UPDATE,
      entityType: "User",
      entityId: tokenRecord.userId,
      after: {
        purpose,
        completedAt: now,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });

  return buildAuthenticatedSession(tokenRecord.userId, tokenRecord.organizationId ?? null, localeContext);
}

export async function completeAccountSetup(
  input: ActionTokenPasswordInput,
  meta: RequestMeta,
  localeContext?: LocaleContext,
) {
  return completeCredentialFlow(input.token, UserActionTokenPurpose.ACCOUNT_SETUP, input.password, meta, localeContext);
}

export async function resetPasswordWithToken(
  input: ActionTokenPasswordInput,
  meta: RequestMeta,
  localeContext?: LocaleContext,
) {
  return completeCredentialFlow(input.token, UserActionTokenPurpose.PASSWORD_RESET, input.password, meta, localeContext);
}

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      passwordHash: true,
    },
  });

  if (!user?.passwordHash) {
    throw ApiError.badRequest("Password is not available for this account");
  }

  const passwordMatches = await bcrypt.compare(input.currentPassword, user.passwordHash);

  if (!passwordMatches) {
    throw ApiError.unauthorized("Current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      passwordHash,
      passwordSetupRequired: false,
      passwordChangedAt: new Date(),
    },
  });

  return {
    success: true,
  };
}

export async function updateMyPreferences(userId: string, input: UpdatePreferencesInput) {
  const user = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      preferredLanguage: input.preferredLanguage,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      isActive: true,
      platformRole: true,
      preferredLanguage: true,
      lastLoginAt: true,
    },
  });

  return user;
}

export async function getMe(
  userId: string,
  activeOrganizationId: string | null,
  role: UserRole,
  localeContext?: LocaleContext,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: {
          status: MembershipStatus.ACTIVE,
          organization: {
            deletedAt: null,
          },
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              email: true,
              status: true,
              defaultLanguage: true,
              industryConfigs: {
                include: {
                  industry: {
                    include: {
                      translations: {
                        orderBy: {
                          language: "asc",
                        },
                      },
                    },
                  },
                },
              },
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

  const resolvedLocaleContext =
    localeContext ??
    createLocaleContext({
      userPreferredLanguage: user.preferredLanguage,
    });

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    isActive: user.isActive,
    platformRole: user.platformRole,
    preferredLanguage: user.preferredLanguage,
    activeOrganizationId,
    role,
    memberships: serializeMemberships(user.memberships, resolvedLocaleContext),
    lastLoginAt: user.lastLoginAt,
  };
}
