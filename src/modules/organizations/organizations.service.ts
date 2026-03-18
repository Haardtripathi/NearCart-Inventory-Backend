import { LanguageCode, OrganizationStatus, UserRole } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { slugify } from "../../utils/slug";
import { assertIndustryExists } from "../../utils/guards";
import { toJsonValue, toNullableJsonValue } from "../../utils/json";

interface CreateOrganizationInput {
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
  primaryIndustryId: string;
  enabledFeatures?: Record<string, unknown>;
  customSettings?: unknown;
  firstBranch: {
    code: string;
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

export async function createOrganization(
  currentUserId: string,
  currentRole: UserRole,
  input: CreateOrganizationInput,
) {
  const industry = await assertIndustryExists(prisma, input.primaryIndustryId);
  const ownerUserId =
    currentRole === UserRole.SUPER_ADMIN && input.ownerUserId ? input.ownerUserId : currentUserId;

  const owner = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { id: true },
  });

  if (!owner) {
    throw ApiError.notFound("Owner user not found");
  }

  const ownerMembershipCount = await prisma.organizationMembership.count({
    where: {
      userId: ownerUserId,
    },
  });

  const slug = slugify(input.slug ?? input.name);

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: input.name.trim(),
        slug,
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

    await tx.organizationIndustryConfig.create({
      data: {
        organizationId: organization.id,
        industryId: industry.id,
        isPrimary: true,
        enabledFeatures: toJsonValue(input.enabledFeatures ?? industry.defaultFeatures)!,
        customSettings: toNullableJsonValue(input.customSettings ?? industry.defaultSettings),
      },
    });

    const firstBranch = await tx.branch.create({
      data: {
        organizationId: organization.id,
        code: input.firstBranch.code.trim(),
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

    await tx.organizationMembership.create({
      data: {
        userId: ownerUserId,
        organizationId: organization.id,
        role: UserRole.ORG_ADMIN,
        isDefault: ownerMembershipCount === 0,
      },
    });

    return {
      ...organization,
      firstBranch,
      primaryIndustry: industry,
    };
  });
}

export async function getMyOrganizations(userId: string) {
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId,
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
