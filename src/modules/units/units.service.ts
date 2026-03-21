import { AuditAction, LanguageCode } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import type { LocaleContext } from "../../utils/localization";
import { serializeLocalizedEntity } from "../../utils/localization";
import { buildPagination, getPagination } from "../../utils/pagination";
import { upsertTranslations } from "../../utils/translations";
import { enrichWithAutoTranslations } from "../../utils/autoTranslate";
import { createAuditLog } from "../audit/audit.service";

interface UnitTranslationInput {
  language: LanguageCode;
  name: string;
}

function serializeUnit(
  unit: Awaited<ReturnType<typeof getUnitRecordById>>,
  localeContext: LocaleContext,
) {
  return serializeLocalizedEntity(unit, localeContext);
}

async function getUnitRecordById(organizationId: string, unitId: string) {
  const unit = await prisma.unit.findFirst({
    where: {
      id: unitId,
      OR: [
        { organizationId },
        { organizationId: null, isSystem: true },
      ],
    },
    include: {
      translations: {
        orderBy: {
          language: "asc",
        },
      },
    },
  });

  if (!unit) {
    throw ApiError.notFound("Unit not found");
  }

  return unit;
}

export async function listUnits(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
  },
  localeContext: LocaleContext,
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    OR: [
      {
        organizationId,
      },
      {
        organizationId: null,
        isSystem: true,
      },
    ],
    ...(query.search
      ? {
          AND: [
            {
              OR: [
                { name: { contains: query.search, mode: "insensitive" as const } },
                { code: { contains: query.search, mode: "insensitive" as const } },
                { symbol: { contains: query.search, mode: "insensitive" as const } },
                {
                  translations: {
                    some: {
                      name: { contains: query.search, mode: "insensitive" as const },
                    },
                  },
                },
              ],
            },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.unit.findMany({
      where,
      include: {
        translations: {
          orderBy: {
            language: "asc",
          },
        },
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      skip,
      take: limit,
    }),
    prisma.unit.count({ where }),
  ]);

  return {
    items: items.map((item) => serializeUnit(item as Awaited<ReturnType<typeof getUnitRecordById>>, localeContext)),
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createUnit(
  organizationId: string,
  actorUserId: string,
  input: {
    code: string;
    name: string;
    symbol?: string;
    allowsDecimal?: boolean;
    translations?: UnitTranslationInput[];
  },
  localeContext: LocaleContext,
) {
  const existing = await prisma.unit.findFirst({
    where: {
      code: input.code.trim().toLowerCase(),
      OR: [
        { organizationId },
        { organizationId: null, isSystem: true },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict("Unit code already exists in this organization or as a system unit");
  }

  const translations = await enrichWithAutoTranslations<UnitTranslationInput>({
    organizationId,
    baseName: input.name,
    existingTranslations: input.translations,
  });

  const unit = await prisma.$transaction(async (tx) => {
    const created = await tx.unit.create({
      data: {
        organizationId,
        code: input.code.trim().toLowerCase(),
        name: input.name.trim(),
        symbol: input.symbol ?? null,
        allowsDecimal: input.allowsDecimal ?? true,
        isSystem: false,
      },
    });

    if (translations.length) {
      await tx.unitTranslation.createMany({
        data: translations.map((translation) => ({
          unitId: created.id,
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
    entityType: "Unit",
    entityId: unit.id,
    after: unit,
  });

  return serializeUnit(await getUnitRecordById(organizationId, unit.id), localeContext);
}

export async function getUnitById(organizationId: string, unitId: string, localeContext: LocaleContext) {
  return serializeUnit(await getUnitRecordById(organizationId, unitId), localeContext);
}

export async function updateUnit(
  organizationId: string,
  unitId: string,
  actorUserId: string,
  input: Partial<{
    code: string;
    name: string;
    symbol: string;
    allowsDecimal: boolean;
    translations: UnitTranslationInput[];
  }>,
  localeContext: LocaleContext,
) {
  const existing = await getUnitRecordById(organizationId, unitId);
  const translations = await enrichWithAutoTranslations<UnitTranslationInput>({
    organizationId: existing.organizationId ?? organizationId,
    baseName: input.name ?? existing.name,
    existingTranslations:
      input.translations ??
      existing.translations.map((translation) => ({
        language: translation.language,
        name: translation.name,
      })),
  });

  await prisma.$transaction(async (tx) => {
    if (!existing.isSystem) {
      await tx.unit.update({
        where: { id: unitId },
        data: {
          ...(input.code ? { code: input.code.trim().toLowerCase() } : {}),
          ...(input.name ? { name: input.name.trim() } : {}),
          ...(input.symbol !== undefined ? { symbol: input.symbol || null } : {}),
          ...(input.allowsDecimal !== undefined ? { allowsDecimal: input.allowsDecimal } : {}),
        },
      });
    }

    await upsertTranslations({
      entries: translations,
      listExisting: () =>
        tx.unitTranslation.findMany({
          where: {
            unitId,
          },
          select: {
            id: true,
            language: true,
          },
        }),
      create: (translation) =>
        tx.unitTranslation.create({
          data: {
            unitId,
            language: translation.language,
            name: translation.name.trim(),
          },
        }),
      update: (current, translation) =>
        tx.unitTranslation.update({
          where: { id: current.id },
          data: {
            name: translation.name.trim(),
          },
        }),
    });
  });

  const updated = await getUnitRecordById(organizationId, unitId);

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "Unit",
    entityId: unitId,
    before: existing,
    after: updated,
  });

  return serializeUnit(updated, localeContext);
}
