import { AuditAction, DriverStatus, LanguageCode } from "@prisma/client";

import { prisma } from "../../config/prisma";
import type { LocaleContext } from "../../utils/localization";
import { serializeLocalizedEntity } from "../../utils/localization";
import { upsertTranslations } from "../../utils/translations";
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
    existingTranslations:
      input.translations ??
      existing.translations.map((translation) => ({
        language: translation.language,
        name: translation.name,
        description: translation.description ?? undefined,
      })),
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
