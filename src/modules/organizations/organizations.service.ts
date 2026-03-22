import {
  LanguageCode,
  MembershipStatus,
  OrganizationStatus,
  UserActionTokenPurpose,
  UserRole,
} from "@prisma/client";

import { prisma } from "../../config/prisma";
import type { DbClient } from "../../types/prisma";
import { ApiError } from "../../utils/ApiError";
import { buildUserActionLink, createUserActionToken } from "../../utils/userActionTokens";
import { slugify } from "../../utils/slug";
import { assertIndustryExists, assertOrganizationExists } from "../../utils/guards";
import { syncEntityFieldTranslations } from "../../utils/entityFieldTranslations";
import { toJsonValue, toNullableJsonValue } from "../../utils/json";
import { generateUniqueBranchCode } from "../../utils/branchCode";

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  legalName?: string;
  phone?: string;
  email?: string;
  status?: OrganizationStatus;
  currencyCode?: string;
  timezone?: string;
  defaultLanguage?: LanguageCode;
  enabledLanguages?: LanguageCode[];
  settings?: unknown;
  ownerUserId?: string;
  owner?: {
    fullName: string;
    email: string;
    preferredLanguage?: LanguageCode;
  };
  primaryIndustryId: string;
  enabledFeatures?: Record<string, unknown>;
  customSettings?: unknown;
  firstBranch: {
    code?: string;
    name: string;
    type: "STORE" | "WAREHOUSE" | "DARK_STORE";
    phone?: string;
    email?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };
}

interface AddOrganizationIndustryInput {
  industryId: string;
  isPrimary?: boolean;
  enabledFeatures?: Record<string, unknown>;
  customSettings?: unknown;
}

interface ResolvedOrganizationOwner {
  id: string;
  fullName: string;
  email: string;
  preferredLanguage: LanguageCode;
  passwordHash: string | null;
  passwordSetupRequired: boolean;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function assertOrganizationManageAccess(
  requesterUserId: string,
  requesterRole: UserRole,
  organizationId: string,
) {
  if (requesterRole === UserRole.SUPER_ADMIN) {
    return;
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId: requesterUserId,
      organizationId,
      status: MembershipStatus.ACTIVE,
      user: {
        isActive: true,
      },
    },
    select: {
      role: true,
    },
  });

  if (!membership || membership.role !== UserRole.ORG_ADMIN) {
    throw ApiError.forbidden("Only org admins can update organization industries");
  }
}

async function resolveOrganizationOwner(
  tx: DbClient,
  currentUserId: string,
  currentRole: UserRole,
  input: CreateOrganizationInput,
) {
  if (currentRole !== UserRole.SUPER_ADMIN) {
    const currentUser = await tx.user.findUnique({
      where: { id: currentUserId },
      select: {
        id: true,
        fullName: true,
        email: true,
        preferredLanguage: true,
        isActive: true,
        passwordHash: true,
        passwordSetupRequired: true,
      },
    });

    if (!currentUser) {
      throw ApiError.notFound("Owner user not found");
    }

    return {
      owner: currentUser,
      requiresAccountSetup: false,
    };
  }

  if (input.ownerUserId) {
    const owner = await tx.user.findUnique({
      where: { id: input.ownerUserId },
      select: {
        id: true,
        fullName: true,
        email: true,
        preferredLanguage: true,
        isActive: true,
        passwordHash: true,
        passwordSetupRequired: true,
      },
    });

    if (!owner) {
      throw ApiError.notFound("Owner user not found");
    }

    if (!owner.isActive) {
      throw ApiError.conflict("Selected owner account is inactive");
    }

    return {
      owner,
      requiresAccountSetup: !owner.passwordHash,
    };
  }

  if (input.owner) {
    const email = normalizeEmail(input.owner.email);
    const existingOwner = await tx.user.findUnique({
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
      },
    });

    if (existingOwner) {
      if (!existingOwner.isActive) {
        throw ApiError.conflict("Selected owner account is inactive");
      }

      if (!existingOwner.passwordHash) {
        const updatedOwner = await tx.user.update({
          where: {
            id: existingOwner.id,
          },
          data: {
            fullName: input.owner.fullName.trim(),
            preferredLanguage: input.owner.preferredLanguage ?? existingOwner.preferredLanguage,
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
          },
        });

        await syncEntityFieldTranslations(tx, {
          entityType: "User",
          entityId: updatedOwner.id,
          fields: [{ fieldKey: "fullName", value: input.owner.fullName }],
        });

        return {
          owner: updatedOwner,
          requiresAccountSetup: true,
        };
      }

      return {
        owner: existingOwner,
        requiresAccountSetup: false,
      };
    }

    const createdOwner = await tx.user.create({
      data: {
        fullName: input.owner.fullName.trim(),
        email,
        preferredLanguage: input.owner.preferredLanguage ?? LanguageCode.EN,
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
      },
    });

    await syncEntityFieldTranslations(tx, {
      entityType: "User",
      entityId: createdOwner.id,
      fields: [{ fieldKey: "fullName", value: input.owner.fullName }],
    });

    return {
      owner: createdOwner,
      requiresAccountSetup: true,
    };
  }

  const currentUser = await tx.user.findUnique({
    where: { id: currentUserId },
    select: {
      id: true,
      fullName: true,
      email: true,
      preferredLanguage: true,
      isActive: true,
      passwordHash: true,
      passwordSetupRequired: true,
    },
  });

  if (!currentUser) {
    throw ApiError.notFound("Owner user not found");
  }

  return {
    owner: currentUser,
    requiresAccountSetup: false,
  };
}

export async function createOrganizationWithResolvedOwner(
  tx: DbClient,
  input: CreateOrganizationInput,
  options: {
    actorUserId: string;
    primaryIndustry: Awaited<ReturnType<typeof assertIndustryExists>>;
    owner: ResolvedOrganizationOwner;
    ownerRequiresAccountSetup: boolean;
  },
) {
  const ownerMembershipCount = await tx.organizationMembership.count({
    where: {
      userId: options.owner.id,
    },
  });

  const organization = await tx.organization.create({
    data: {
      name: input.name.trim(),
      slug: slugify(input.slug ?? input.name),
      legalName: input.legalName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      status: input.status ?? OrganizationStatus.ACTIVE,
      currencyCode: input.currencyCode ?? "INR",
      timezone: input.timezone ?? "Asia/Kolkata",
      defaultLanguage: input.defaultLanguage ?? LanguageCode.EN,
      enabledLanguages: input.enabledLanguages ?? [LanguageCode.EN, LanguageCode.HI, LanguageCode.GU],
      settings: toNullableJsonValue(input.settings),
    },
  });

  await syncEntityFieldTranslations(tx, {
    entityType: "Organization",
    entityId: organization.id,
    fields: [
      { fieldKey: "name", value: input.name },
      { fieldKey: "legalName", value: input.legalName },
    ],
  });

  await tx.organizationIndustryConfig.create({
    data: {
      organizationId: organization.id,
      industryId: options.primaryIndustry.id,
      isPrimary: true,
      enabledFeatures: toJsonValue(input.enabledFeatures ?? options.primaryIndustry.defaultFeatures)!,
      customSettings: toNullableJsonValue(input.customSettings ?? options.primaryIndustry.defaultSettings),
    },
  });

  let firstBranchCode = input.firstBranch.code?.trim();

  if (!firstBranchCode) {
    firstBranchCode = await generateUniqueBranchCode(async (candidateCode) => {
      const existingBranch = await tx.branch.findFirst({
        where: {
          organizationId: organization.id,
          code: candidateCode,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      return Boolean(existingBranch);
    });
  }

  const firstBranch = await tx.branch.create({
    data: {
      organizationId: organization.id,
      code: firstBranchCode,
      name: input.firstBranch.name.trim(),
      type: input.firstBranch.type,
      phone: input.firstBranch.phone ?? null,
      email: input.firstBranch.email ?? null,
      addressLine1: input.firstBranch.addressLine1 ?? null,
      addressLine2: input.firstBranch.addressLine2 ?? null,
      city: input.firstBranch.city ?? null,
      state: input.firstBranch.state ?? null,
      country: input.firstBranch.country ?? null,
      postalCode: input.firstBranch.postalCode ?? null,
    },
  });

  await syncEntityFieldTranslations(tx, {
    organizationId: organization.id,
    entityType: "Branch",
    entityId: firstBranch.id,
    fields: [
      { fieldKey: "name", value: input.firstBranch.name },
      { fieldKey: "addressLine1", value: input.firstBranch.addressLine1 },
      { fieldKey: "addressLine2", value: input.firstBranch.addressLine2 },
      { fieldKey: "city", value: input.firstBranch.city },
      { fieldKey: "state", value: input.firstBranch.state },
      { fieldKey: "country", value: input.firstBranch.country },
    ],
  });

  await tx.organizationMembership.create({
    data: {
      userId: options.owner.id,
      organizationId: organization.id,
      role: UserRole.ORG_ADMIN,
      status: options.ownerRequiresAccountSetup ? MembershipStatus.INVITED : MembershipStatus.ACTIVE,
      isDefault: ownerMembershipCount === 0,
      invitedByUserId: options.ownerRequiresAccountSetup ? options.actorUserId : null,
      invitedAt: options.ownerRequiresAccountSetup ? new Date() : null,
      acceptedAt: options.ownerRequiresAccountSetup ? null : new Date(),
    },
  });

  const ownerAccessLink = options.ownerRequiresAccountSetup
    ? await createUserActionToken(tx, {
        userId: options.owner.id,
        createdByUserId: options.actorUserId,
        organizationId: organization.id,
        purpose: UserActionTokenPurpose.ACCOUNT_SETUP,
        expiresInHours: 24 * 7,
        metadata: {
          organizationId: organization.id,
        },
      })
    : null;

  return {
    organization,
    firstBranch,
    primaryIndustry: options.primaryIndustry,
    ownerUser: {
      id: options.owner.id,
      fullName: options.owner.fullName,
      email: options.owner.email,
      preferredLanguage: options.owner.preferredLanguage,
      requiresAccountSetup: options.ownerRequiresAccountSetup,
    },
    ownerAccessLink: ownerAccessLink
      ? {
          purpose: UserActionTokenPurpose.ACCOUNT_SETUP,
          token: ownerAccessLink.rawToken,
          url: buildUserActionLink("/account-setup", ownerAccessLink.rawToken),
          expiresAt: ownerAccessLink.record.expiresAt,
        }
      : null,
  };
}

export async function createOrganization(
  currentUserId: string,
  currentRole: UserRole,
  input: CreateOrganizationInput,
) {
  const industry = await assertIndustryExists(prisma, input.primaryIndustryId);

  return prisma.$transaction(async (tx) => {
    const ownerResolution = await resolveOrganizationOwner(tx, currentUserId, currentRole, input);
    const created = await createOrganizationWithResolvedOwner(tx, input, {
      actorUserId: currentUserId,
      primaryIndustry: industry,
      owner: ownerResolution.owner,
      ownerRequiresAccountSetup: ownerResolution.requiresAccountSetup,
    });

    return {
      ...created.organization,
      firstBranch: created.firstBranch,
      primaryIndustry: created.primaryIndustry,
      ownerUser: created.ownerUser,
      ownerAccessLink: created.ownerAccessLink,
    };
  });
}

export async function getMyOrganizations(userId: string, requesterRole: UserRole) {
  if (requesterRole === UserRole.SUPER_ADMIN) {
    const organizations = await prisma.organization.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        industryConfigs: {
          include: {
            industry: true,
          },
        },
        memberships: {
          where: {
            userId,
            status: MembershipStatus.ACTIVE,
            user: {
              isActive: true,
            },
          },
          select: {
            role: true,
            isDefault: true,
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      role: organization.memberships[0]?.role ?? UserRole.SUPER_ADMIN,
      isDefault: organization.memberships[0]?.isDefault ?? false,
      industries: organization.industryConfigs,
    }));
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId,
      status: MembershipStatus.ACTIVE,
      user: {
        isActive: true,
      },
      organization: {
        deletedAt: null,
      },
    },
    include: {
      organization: {
        include: {
          industryConfigs: {
            include: {
              industry: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return memberships.map((membership) => ({
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    status: membership.organization.status,
    role: membership.role,
    isDefault: membership.isDefault,
    industries: membership.organization.industryConfigs,
  }));
}

export async function getOrganizationById(requesterUserId: string, requesterRole: UserRole, organizationId: string) {
  if (requesterRole !== UserRole.SUPER_ADMIN) {
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        userId: requesterUserId,
        organizationId,
        status: MembershipStatus.ACTIVE,
        user: {
          isActive: true,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      throw ApiError.forbidden("You do not have access to this organization");
    }
  }

  const organization = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      deletedAt: null,
    },
    include: {
      industryConfigs: {
        include: {
          industry: true,
        },
      },
      branches: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!organization) {
    throw ApiError.notFound("Organization not found");
  }

  return organization;
}

export async function addIndustryToOrganization(
  requesterUserId: string,
  requesterRole: UserRole,
  organizationId: string,
  input: AddOrganizationIndustryInput,
) {
  await assertOrganizationManageAccess(requesterUserId, requesterRole, organizationId);
  await assertOrganizationExists(prisma, organizationId);
  const industry = await assertIndustryExists(prisma, input.industryId);

  const currentConfigCount = await prisma.organizationIndustryConfig.count({
    where: {
      organizationId,
    },
  });

  return prisma.$transaction(async (tx) => {
    const shouldBePrimary = input.isPrimary ?? currentConfigCount === 0;

    if (shouldBePrimary) {
      await tx.organizationIndustryConfig.updateMany({
        where: {
          organizationId,
        },
        data: {
          isPrimary: false,
        },
      });
    }

    const config = await tx.organizationIndustryConfig.upsert({
      where: {
        organizationId_industryId: {
          organizationId,
          industryId: industry.id,
        },
      },
      update: {
        isPrimary: shouldBePrimary,
        enabledFeatures: toJsonValue(input.enabledFeatures ?? industry.defaultFeatures)!,
        customSettings: toNullableJsonValue(input.customSettings ?? industry.defaultSettings),
      },
      create: {
        organizationId,
        industryId: industry.id,
        isPrimary: shouldBePrimary,
        enabledFeatures: toJsonValue(input.enabledFeatures ?? industry.defaultFeatures)!,
        customSettings: toNullableJsonValue(input.customSettings ?? industry.defaultSettings),
      },
      include: {
        industry: true,
      },
    });

    return config;
  });
}
