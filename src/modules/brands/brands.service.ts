import { AuditAction, LanguageCode } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import type { LocaleContext } from "../../utils/localization";
import { serializeLocalizedEntity } from "../../utils/localization";
import { buildPagination, getPagination } from "../../utils/pagination";
import { slugify } from "../../utils/slug";
import { upsertTranslations } from "../../utils/translations";
import { enrichWithAutoTranslations } from "../../utils/autoTranslate";
import { createAuditLog } from "../audit/audit.service";

interface BrandTranslationInput {
  language: LanguageCode;
  name: string;
}

function serializeBrand(
  brand: Awaited<ReturnType<typeof getBrandRecordById>>,
  localeContext: LocaleContext,
) {
  return serializeLocalizedEntity(brand, localeContext);
}

async function getBrandRecordById(organizationId: string, brandId: string) {
  const brand = await prisma.brand.findFirst({
    where: {
      id: brandId,
      organizationId,
      deletedAt: null,
    },
    include: {
      translations: {
        orderBy: {
          language: "asc",
        },
      },
    },
  });

  if (!brand) {
    throw ApiError.notFound("Brand not found");
  }

  return brand;
}

export async function listBrands(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
    isActive?: boolean;
  },
  localeContext: LocaleContext,
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    deletedAt: null,
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { slug: { contains: query.search, mode: "insensitive" as const } },
            {
              translations: {
                some: {
                  name: { contains: query.search, mode: "insensitive" as const },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.brand.findMany({
      where,
      include: {
        translations: {
          orderBy: {
            language: "asc",
          },
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.brand.count({ where }),
  ]);

  const serializedItems = items.map((item) => serializeBrand(item, localeContext));

  return {
    items: serializedItems,
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createBrand(
  organizationId: string,
  actorUserId: string,
  input: {
    name: string;
    slug?: string;
    isActive?: boolean;
    translations?: BrandTranslationInput[];
  },
  localeContext: LocaleContext,
) {
  const translations = await enrichWithAutoTranslations<BrandTranslationInput>({
    organizationId,
    baseName: input.name,
    existingTranslations: input.translations,
  });

  const brand = await prisma.$transaction(async (tx) => {
    const created = await tx.brand.create({
      data: {
        organizationId,
        name: input.name.trim(),
        slug: slugify(input.slug ?? input.name),
        isActive: input.isActive ?? true,
      },
    });

    if (translations.length) {
      await tx.brandTranslation.createMany({
        data: translations.map((translation) => ({
          brandId: created.id,
          language: translation.language,
          name: translation.name.trim(),
        })),
      });
    }

    return created;
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "Brand",
    entityId: brand.id,
    after: brand,
  });

  return serializeBrand(await getBrandRecordById(organizationId, brand.id), localeContext);
}

export async function getBrandById(
  organizationId: string,
  brandId: string,
  localeContext: LocaleContext,
) {
  return serializeBrand(await getBrandRecordById(organizationId, brandId), localeContext);
}

export async function updateBrand(
  organizationId: string,
  brandId: string,
  actorUserId: string,
  input: Partial<{
    name: string;
    slug: string;
    isActive: boolean;
    translations: BrandTranslationInput[];
  }>,
  localeContext: LocaleContext,
) {
  const existing = await getBrandRecordById(organizationId, brandId);

  await prisma.$transaction(async (tx) => {
    await tx.brand.update({
      where: { id: brandId },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.slug ? { slug: slugify(input.slug) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await upsertTranslations({
      entries: input.translations ?? [],
      listExisting: () =>
        tx.brandTranslation.findMany({
          where: {
            brandId,
          },
        }),
      create: (entry) =>
        tx.brandTranslation.create({
          data: {
            brandId,
            language: entry.language,
            name: entry.name.trim(),
          },
        }),
      update: (existing, entry) =>
        tx.brandTranslation.update({
          where: { id: existing.id },
          data: {
            name: entry.name.trim(),
          },
        }),
    });
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "Brand",
    entityId: brandId,
    before: existing,
    after: await getBrandRecordById(organizationId, brandId),
  });

  return serializeBrand(await getBrandRecordById(organizationId, brandId), localeContext);
}

export async function deleteBrand(organizationId: string, brandId: string, actorUserId: string) {
  const existing = await getBrandRecordById(organizationId, brandId);

  const deleted = await prisma.brand.update({
    where: { id: brandId },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.DELETE,
    entityType: "Brand",
    entityId: deleted.id,
    before: existing,
    after: deleted,
  });

  return deleted;
}
