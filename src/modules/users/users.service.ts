import {
  AuditAction,
  LanguageCode,
  MembershipStatus,
  UserActionTokenPurpose,
  UserRole,
} from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import {
  assertBranchAccessInOrganization,
  normalizeBranchAccess,
  type BranchAccessState,
} from "../../utils/branchAccess";
import { syncEntityFieldTranslations } from "../../utils/entityFieldTranslations";
import { toNullableJsonValue } from "../../utils/json";
import { buildUserActionLink, createUserActionToken } from "../../utils/userActionTokens";
import { createAuditLog } from "../audit/audit.service";

const ACCOUNT_SETUP_TOKEN_HOURS = 24 * 7;
const PASSWORD_RESET_TOKEN_HOURS = 24;
const INTERACTIVE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function assertManageableRole(actorRole: UserRole, targetRole: UserRole) {
  if (targetRole === UserRole.SUPER_ADMIN) {
    throw ApiError.forbidden("Super admin accounts cannot be created or assigned from this flow");
  }

  if (actorRole === UserRole.SUPER_ADMIN) {
    return;
  }

  if (actorRole === UserRole.ORG_ADMIN) {
    if ([UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.STAFF].includes(targetRole)) {
      return;
    }
  }

  throw ApiError.forbidden("You do not have permission to manage this role");
}

function serializeAccessLink(link: {
  purpose: UserActionTokenPurpose;
  rawToken: string;
  expiresAt: Date;
}) {
  const pathname = link.purpose === UserActionTokenPurpose.ACCOUNT_SETUP ? "/account-setup" : "/reset-password";

  return {
    purpose: link.purpose,
    token: link.rawToken,
    url: buildUserActionLink(pathname, link.rawToken),
    expiresAt: link.expiresAt,
  };
}

async function getMembershipRecord(organizationId: string, userId: string) {
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      organizationId,
      userId,
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          preferredLanguage: true,
          isActive: true,
          platformRole: true,
          passwordHash: true,
          passwordSetupRequired: true,
          lastLoginAt: true,
        },
      },
    },
  });

  if (!membership) {
    throw ApiError.notFound("Organization user not found");
  }

  return membership;
}

async function assertNotRemovingLastActiveOrgAdmin(
  organizationId: string,
  membershipId: string,
  currentRole: UserRole,
  currentStatus: MembershipStatus,
  nextRole: UserRole,
  nextStatus: MembershipStatus,
) {
  const isCurrentlyActiveAdmin = currentRole === UserRole.ORG_ADMIN && currentStatus === MembershipStatus.ACTIVE;
  const remainsActiveAdmin = nextRole === UserRole.ORG_ADMIN && nextStatus === MembershipStatus.ACTIVE;

  if (!isCurrentlyActiveAdmin || remainsActiveAdmin) {
    return;
  }

  const remainingActiveOrgAdmins = await prisma.organizationMembership.count({
    where: {
      organizationId,
      id: {
        not: membershipId,
      },
      role: UserRole.ORG_ADMIN,
      status: MembershipStatus.ACTIVE,
      user: {
        isActive: true,
      },
    },
  });

  if (remainingActiveOrgAdmins === 0) {
    throw ApiError.conflict("Each organization needs at least one active org admin");
  }
}

async function resolveBranchMap(organizationId: string, memberships: Array<{ branchAccess: unknown }>) {
  const branchIds = Array.from(
    new Set(
      memberships.flatMap((membership) => normalizeBranchAccess(membership.branchAccess).branchIds),
    ),
  );

  if (branchIds.length === 0) {
    return new Map<string, { id: string; code: string | null; name: string }>();
  }

  const branches = await prisma.branch.findMany({
    where: {
      organizationId,
      id: {
        in: branchIds,
      },
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  return new Map(branches.map((branch) => [branch.id, branch]));
}

function serializeMembership(
  membership: Awaited<ReturnType<typeof getMembershipRecord>>,
  branchMap: Map<string, { id: string; code: string | null; name: string }>,
) {
  const branchAccess = normalizeBranchAccess(membership.branchAccess);

  return {
    id: membership.user.id,
    fullName: membership.user.fullName,
    email: membership.user.email,
    preferredLanguage: membership.user.preferredLanguage,
    isActive: membership.user.isActive,
    platformRole: membership.user.platformRole,
    lastLoginAt: membership.user.lastLoginAt,
    role: membership.role,
    status: membership.status,
    isDefault: membership.isDefault,
    branchAccess,
    accessibleBranches:
      branchAccess.scope === "ALL"
        ? []
        : branchAccess.branchIds
            .map((branchId) => branchMap.get(branchId))
            .filter(Boolean),
    invitedAt: membership.invitedAt,
    acceptedAt: membership.acceptedAt,
    passwordSetupRequired: membership.user.passwordSetupRequired,
  };
}

export async function searchUsersDirectory(search?: string) {
  const query = search?.trim();

  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            {
              fullName: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: query,
                mode: "insensitive",
              },
            },
          ],
        }
      : undefined,
    select: {
      id: true,
      fullName: true,
      email: true,
      platformRole: true,
      preferredLanguage: true,
      isActive: true,
      passwordSetupRequired: true,
      lastLoginAt: true,
      _count: {
        select: {
          memberships: true,
        },
      },
    },
    orderBy: [{ fullName: "asc" }, { email: "asc" }],
    take: 20,
  });

  return users.map((user) => ({
    ...user,
    membershipCount: user._count.memberships,
  }));
}

export async function listOrganizationUsers(organizationId: string) {
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      organizationId,
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          preferredLanguage: true,
          isActive: true,
          platformRole: true,
          passwordHash: true,
          passwordSetupRequired: true,
          lastLoginAt: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  const branchMap = await resolveBranchMap(organizationId, memberships);
  return memberships.map((membership) => serializeMembership(membership as never, branchMap));
}

export async function createOrganizationUser(
  actorUserId: string,
  actorRole: UserRole,
  organizationId: string,
  input: {
    fullName: string;
    email: string;
    role: UserRole;
    preferredLanguage?: LanguageCode;
    branchAccess?: BranchAccessState;
  },
) {
  assertManageableRole(actorRole, input.role);

  const email = normalizeEmail(input.email);
  const normalizedBranchAccess = await assertBranchAccessInOrganization(
    prisma,
    organizationId,
    normalizeBranchAccess(input.branchAccess),
  );

  const existingMembershipByEmail = await prisma.organizationMembership.findFirst({
    where: {
      organizationId,
      user: {
        email,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingMembershipByEmail) {
    throw ApiError.conflict("This user already belongs to the organization");
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        preferredLanguage: true,
        isActive: true,
        passwordHash: true,
        passwordSetupRequired: true,
        platformRole: true,
        lastLoginAt: true,
      },
    });

    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          fullName: input.fullName.trim(),
          email,
          preferredLanguage: input.preferredLanguage ?? LanguageCode.EN,
          isActive: true,
          passwordSetupRequired: true,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          preferredLanguage: true,
          isActive: true,
          passwordHash: true,
          passwordSetupRequired: true,
          platformRole: true,
          lastLoginAt: true,
        },
      }));

    if (!existingUser) {
      await syncEntityFieldTranslations(tx, {
        entityType: "User",
        entityId: user.id,
        fields: [{ fieldKey: "fullName", value: input.fullName }],
      });
    }

    if (existingUser && !existingUser.isActive) {
      await tx.user.update({
        where: {
          id: existingUser.id,
        },
        data: {
          isActive: true,
        },
      });
    }

    if (existingUser && !existingUser.passwordHash) {
      await tx.user.update({
        where: {
          id: existingUser.id,
        },
        data: {
          fullName: input.fullName.trim(),
          preferredLanguage: input.preferredLanguage ?? existingUser.preferredLanguage,
          passwordSetupRequired: true,
        },
      });

      await syncEntityFieldTranslations(tx, {
        entityType: "User",
        entityId: existingUser.id,
        fields: [{ fieldKey: "fullName", value: input.fullName }],
      });
    }

    const membershipCount = await tx.organizationMembership.count({
      where: {
        userId: user.id,
      },
    });

    const membershipStatus = user.passwordHash ? MembershipStatus.ACTIVE : MembershipStatus.INVITED;
    const now = new Date();

    const membership = await tx.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId,
        role: input.role,
        status: membershipStatus,
        isDefault: membershipCount === 0,
        branchAccess: toNullableJsonValue(normalizedBranchAccess),
        invitedByUserId: membershipStatus === MembershipStatus.INVITED ? actorUserId : null,
        invitedAt: membershipStatus === MembershipStatus.INVITED ? now : null,
        acceptedAt: membershipStatus === MembershipStatus.ACTIVE ? now : null,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            preferredLanguage: true,
            isActive: true,
            platformRole: true,
            passwordHash: true,
            passwordSetupRequired: true,
            lastLoginAt: true,
          },
        },
      },
    });

    let accessLink:
      | {
          purpose: UserActionTokenPurpose;
          rawToken: string;
          expiresAt: Date;
        }
      | null = null;

    if (membershipStatus === MembershipStatus.INVITED) {
      const token = await createUserActionToken(tx, {
        userId: user.id,
        createdByUserId: actorUserId,
        organizationId,
        purpose: UserActionTokenPurpose.ACCOUNT_SETUP,
        expiresInHours: ACCOUNT_SETUP_TOKEN_HOURS,
        metadata: {
          organizationId,
          membershipId: membership.id,
        },
      });

      accessLink = {
        purpose: UserActionTokenPurpose.ACCOUNT_SETUP,
        rawToken: token.rawToken,
        expiresAt: token.record.expiresAt,
      };
    }

    await createAuditLog(tx, {
      organizationId,
      actorUserId,
      action: AuditAction.CREATE,
      entityType: "OrganizationMembership",
      entityId: membership.id,
      after: {
        userId: user.id,
        email: user.email,
        role: membership.role,
        status: membership.status,
        branchAccess: normalizedBranchAccess,
      },
    });

    return {
      membership,
      accessLink,
    };
  }, INTERACTIVE_TRANSACTION_OPTIONS);

  const branchMap = await resolveBranchMap(organizationId, [result.membership]);

  return {
    user: serializeMembership(result.membership as never, branchMap),
    accessLink: result.accessLink ? serializeAccessLink(result.accessLink) : null,
  };
}

export async function updateOrganizationUser(
  actorUserId: string,
  actorRole: UserRole,
  organizationId: string,
  userId: string,
  input: Partial<{
    fullName: string;
    role: UserRole;
    preferredLanguage: LanguageCode;
    status: MembershipStatus;
    branchAccess: BranchAccessState;
  }>,
) {
  const existing = await getMembershipRecord(organizationId, userId);
  const nextRole = input.role ?? existing.role;
  const nextStatus = input.status ?? existing.status;

  assertManageableRole(actorRole, existing.role);
  assertManageableRole(actorRole, nextRole);

  if (nextStatus === MembershipStatus.ACTIVE && !existing.user.passwordHash) {
    throw ApiError.conflict("This invited user must complete account setup before activation");
  }

  const normalizedBranchAccess =
    input.branchAccess !== undefined
      ? await assertBranchAccessInOrganization(prisma, organizationId, normalizeBranchAccess(input.branchAccess))
      : normalizeBranchAccess(existing.branchAccess);

  await assertNotRemovingLastActiveOrgAdmin(
    organizationId,
    existing.id,
    existing.role,
    existing.status,
    nextRole,
    nextStatus,
  );

  const updated = await prisma.$transaction(async (tx) => {
    if (input.fullName || input.preferredLanguage) {
      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          ...(input.fullName ? { fullName: input.fullName.trim() } : {}),
          ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
        },
      });

      await syncEntityFieldTranslations(tx, {
        entityType: "User",
        entityId: userId,
        fields: [{ fieldKey: "fullName", value: input.fullName ?? existing.user.fullName }],
      });
    }

    const membership = await tx.organizationMembership.update({
      where: {
        id: existing.id,
      },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.branchAccess !== undefined ? { branchAccess: toNullableJsonValue(normalizedBranchAccess) } : {}),
        ...(existing.status !== MembershipStatus.ACTIVE && nextStatus === MembershipStatus.ACTIVE
          ? { acceptedAt: new Date() }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            preferredLanguage: true,
            isActive: true,
            platformRole: true,
            passwordHash: true,
            passwordSetupRequired: true,
            lastLoginAt: true,
          },
        },
      },
    });

    await createAuditLog(tx, {
      organizationId,
      actorUserId,
      action: AuditAction.UPDATE,
      entityType: "OrganizationMembership",
      entityId: membership.id,
      before: {
        role: existing.role,
        status: existing.status,
        branchAccess: normalizeBranchAccess(existing.branchAccess),
      },
      after: {
        role: membership.role,
        status: membership.status,
        branchAccess: normalizedBranchAccess,
      },
    });

    return membership;
  }, INTERACTIVE_TRANSACTION_OPTIONS);

  const branchMap = await resolveBranchMap(organizationId, [updated]);
  return serializeMembership(updated as never, branchMap);
}

export async function generateOrganizationUserAccessLink(
  actorUserId: string,
  organizationId: string,
  userId: string,
) {
  const membership = await getMembershipRecord(organizationId, userId);
  const purpose = membership.user.passwordHash
    ? UserActionTokenPurpose.PASSWORD_RESET
    : UserActionTokenPurpose.ACCOUNT_SETUP;

  const token = await prisma.$transaction(async (tx) => {
    const created = await createUserActionToken(tx, {
      userId,
      createdByUserId: actorUserId,
      organizationId,
      purpose,
      expiresInHours: purpose === UserActionTokenPurpose.ACCOUNT_SETUP ? ACCOUNT_SETUP_TOKEN_HOURS : PASSWORD_RESET_TOKEN_HOURS,
      metadata: {
        organizationId,
        membershipId: membership.id,
      },
    });

    await createAuditLog(tx, {
      organizationId,
      actorUserId,
      action: AuditAction.UPDATE,
      entityType: "UserActionToken",
      entityId: created.record.id,
      after: {
        userId,
        purpose,
        expiresAt: created.record.expiresAt,
      },
    });

    return created;
  }, INTERACTIVE_TRANSACTION_OPTIONS);

  return serializeAccessLink({
    purpose,
    rawToken: token.rawToken,
    expiresAt: token.record.expiresAt,
  });
}
