import { AuditAction, DriverStatus, LanguageCode } from "@prisma/client";

import { prisma } from "../../config/prisma";
import type { LocaleContext } from "../../utils/localization";
import { serializeLocalizedEntity } from "../../utils/localization";
import { mergeTranslationsForUpdate, upsertTranslations } from "../../utils/translations";
import { toJsonValue, toNullableJsonValue } from "../../utils/json";
import { slugify } from "../../utils/slug";
import { enrichWithAutoTranslations } from "../../utils/autoTranslate";
import { ApiError } from "../../utils/ApiError";
import { buildPagination, getPagination } from "../../utils/pagination";
import { createAuditLog } from "../audit/audit.service";

interface IndustryTranslationInput {
  language: LanguageCode;
  name: string;
  description?: string;
}

function serializeIndustry(
  industry: Awaited<ReturnType<typeof getIndustryWithTranslations>>,
  localeContext: LocaleContext,
) {
  return serializeLocalizedEntity(industry, localeContext);
}

async function getIndustryWithTranslations(industryId: string) {
  return prisma.industry.findUniqueOrThrow({
    where: {
      id: industryId,
    },
    include: {
      translations: {
        orderBy: {
          language: "asc",
        },
      },
    },
  });
}

export async function listIndustries(localeContext: LocaleContext) {
  const industries = await prisma.industry.findMany({
    orderBy: {
      name: "asc",
    },
    include: {
      translations: {
        orderBy: {
          language: "asc",
        },
      },
    },
  });

  return industries.map((industry) => serializeIndustry(industry, localeContext));
}

export async function createIndustry(input: {
  code: string;
  name: string;
  description?: string;
  isActive?: boolean;
  defaultFeatures: Record<string, unknown>;
  defaultSettings?: unknown;
  customFieldDefinitions?: unknown;
  translations?: IndustryTranslationInput[];
}, localeContext: LocaleContext) {
  const translations = await enrichWithAutoTranslations<IndustryTranslationInput>({
    baseName: input.name,
    baseDescription: input.description,
    existingTranslations: input.translations,
  });

  const industry = await prisma.$transaction(async (tx) => {
    const created = await tx.industry.create({
      data: {
        code: slugify(input.code).replace(/-/g, "_"),
        name: input.name.trim(),
        description: input.description?.trim(),
        isActive: input.isActive ?? true,
        defaultFeatures: toJsonValue(input.defaultFeatures)!,
        defaultSettings: toNullableJsonValue(input.defaultSettings),
        customFieldDefinitions: toNullableJsonValue(input.customFieldDefinitions),
      },
    });

    if (translations.length) {
      await tx.industryTranslation.createMany({
        data: translations.map((translation) => ({
          industryId: created.id,
          language: translation.language,
          name: translation.name.trim(),
          description: translation.description?.trim() ?? null,
        })),
      });
    }

    return created;
  });

  return serializeIndustry(await getIndustryWithTranslations(industry.id), localeContext);
}

export async function updateIndustry(
  industryId: string,
  input: Partial<{
    code: string;
    name: string;
    description: string;
    isActive: boolean;
    defaultFeatures: Record<string, unknown>;
    defaultSettings: unknown;
    customFieldDefinitions: unknown;
    translations: IndustryTranslationInput[];
  }>,
  localeContext: LocaleContext,
) {
  const existing = await getIndustryWithTranslations(industryId);
  const translations = await enrichWithAutoTranslations<IndustryTranslationInput>({
    baseName: input.name ?? existing.name,
    baseDescription: input.description ?? existing.description ?? undefined,
    existingTranslations: mergeTranslationsForUpdate(
      existing.translations.map((translation) => ({
        language: translation.language,
        name: translation.name,
        description: translation.description ?? undefined,
      })),
      input.translations,
    ),
  });

  await prisma.$transaction(async (tx) => {
    await tx.industry.update({
      where: { id: industryId },
      data: {
        ...(input.code ? { code: slugify(input.code).replace(/-/g, "_") } : {}),
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.defaultFeatures ? { defaultFeatures: toJsonValue(input.defaultFeatures)! } : {}),
        ...(input.defaultSettings !== undefined ? { defaultSettings: toNullableJsonValue(input.defaultSettings) } : {}),
        ...(input.customFieldDefinitions !== undefined
          ? { customFieldDefinitions: toNullableJsonValue(input.customFieldDefinitions) }
          : {}),
      },
    });

    await upsertTranslations({
      entries: translations,
      listExisting: () =>
        tx.industryTranslation.findMany({
          where: {
            industryId,
          },
          select: {
            id: true,
            language: true,
          },
        }),
      create: (translation) =>
        tx.industryTranslation.create({
          data: {
            industryId,
            language: translation.language,
            name: translation.name.trim(),
            description: translation.description?.trim() ?? null,
          },
        }),
      update: (existing, translation) =>
        tx.industryTranslation.update({
          where: {
            id: existing.id,
          },
          data: {
            name: translation.name.trim(),
            description: translation.description?.trim() ?? null,
          },
        }),
    });
  });

  return serializeIndustry(await getIndustryWithTranslations(industryId), localeContext);
}

function serializeDriver(driver: {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  vehicleType: string;
  vehicleNumber: string;
  status: DriverStatus;
  createdAt: Date;
  updatedAt: Date;
  // Bug found live 2026-08-15: this function silently dropped every onboarding-verification
  // field (vehicle photo/plate, license photo/number/holder/expiry, match score, overall
  // onboarding status) even though `prisma.driver.findMany()` (no `select`) already returns them
  // — a platform admin verifying a driver had no way to actually see the uploaded documents.
  vehiclePhotoUrl: string | null;
  vehiclePlateNumber: string | null;
  vehiclePlateVerified: boolean;
  vehiclePhotoClarityOk: boolean | null;
  licensePhotoUrl: string | null;
  licenseNumber: string | null;
  licenseHolderName: string | null;
  licenseDob: string | null;
  licenseExpiry: string | null;
  licenseVerified: boolean;
  licenseMatchScore: number | null;
  onboardingVerificationStatus: string;
}) {
  return {
    id: driver.id,
    fullName: driver.fullName,
    phone: driver.phone,
    email: driver.email,
    vehicleType: driver.vehicleType,
    vehicleNumber: driver.vehicleNumber,
    status: driver.status,
    createdAt: driver.createdAt,
    updatedAt: driver.updatedAt,
    vehiclePhotoUrl: driver.vehiclePhotoUrl,
    vehiclePlateNumber: driver.vehiclePlateNumber,
    vehiclePlateVerified: driver.vehiclePlateVerified,
    vehiclePhotoClarityOk: driver.vehiclePhotoClarityOk,
    licensePhotoUrl: driver.licensePhotoUrl,
    licenseNumber: driver.licenseNumber,
    licenseHolderName: driver.licenseHolderName,
    licenseDob: driver.licenseDob,
    licenseExpiry: driver.licenseExpiry,
    licenseVerified: driver.licenseVerified,
    licenseMatchScore: driver.licenseMatchScore,
    onboardingVerificationStatus: driver.onboardingVerificationStatus,
  };
}

export async function listPlatformDrivers(query: { page: number; limit: number; status?: DriverStatus }) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = query.status ? { status: query.status } : {};

  const [items, totalItems] = await prisma.$transaction([
    prisma.driver.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.driver.count({ where }),
  ]);

  return {
    items: items.map(serializeDriver),
    pagination: buildPagination(page, limit, totalItems),
  };
}

async function getDriverOrThrow(driverId: string) {
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });

  if (!driver) {
    throw ApiError.notFound("Driver not found");
  }

  return driver;
}

export async function verifyPlatformDriver(actorUserId: string, driverId: string) {
  const driver = await getDriverOrThrow(driverId);

  const updated = await prisma.driver.update({
    where: { id: driverId },
    data: { status: DriverStatus.VERIFIED },
  });

  await createAuditLog(prisma, {
    actorUserId,
    action: AuditAction.DRIVER_VERIFY,
    entityType: "Driver",
    entityId: driver.id,
    before: { status: driver.status },
    after: { status: updated.status },
  });

  return serializeDriver(updated);
}

// Contract fixed by the frontend/mobile clients ahead of this endpoint existing — see
// NearCart-Inventory/frontend's `src/types/platform.ts` (`PlatformOrganizationOverview`) and
// `src/features/platform/platform.api.ts`. One row per non-deleted organization with cheap
// activity signals a SUPER_ADMIN needs to pick/triage an org, not full org detail.
export async function listPlatformOrganizations() {
  const organizations = await prisma.organization.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      createdAt: true,
      _count: {
        select: {
          branches: true,
          memberships: true,
          salesOrders: true,
        },
      },
      salesOrders: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  return organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    createdAt: organization.createdAt.toISOString(),
    branchCount: organization._count.branches,
    memberCount: organization._count.memberships,
    salesOrderCount: organization._count.salesOrders,
    lastSalesOrderAt: organization.salesOrders[0]?.createdAt.toISOString() ?? null,
  }));
}

export async function suspendPlatformDriver(actorUserId: string, driverId: string) {
  const driver = await getDriverOrThrow(driverId);

  const updated = await prisma.driver.update({
    where: { id: driverId },
    data: { status: DriverStatus.SUSPENDED },
  });

  await createAuditLog(prisma, {
    actorUserId,
    action: AuditAction.DRIVER_SUSPEND,
    entityType: "Driver",
    entityId: driver.id,
    before: { status: driver.status },
    after: { status: updated.status },
  });

  return serializeDriver(updated);
}
