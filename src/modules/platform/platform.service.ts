import { LanguageCode } from "@prisma/client";

import { prisma } from "../../config/prisma";
import type { LocaleContext } from "../../utils/localization";
import { serializeLocalizedEntity } from "../../utils/localization";
import { upsertTranslations } from "../../utils/translations";
import { toJsonValue, toNullableJsonValue } from "../../utils/json";
import { slugify } from "../../utils/slug";

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

    if (input.translations?.length) {
      await tx.industryTranslation.createMany({
        data: input.translations.map((translation) => ({
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
      entries: input.translations ?? [],
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
