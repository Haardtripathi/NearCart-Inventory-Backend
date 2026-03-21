import { LanguageCode } from "@prisma/client";

import { prisma } from "../config/prisma";
import type { DbClient } from "../types/prisma";
import type { LocaleContext } from "./localization";
import { SUPPORTED_LANGUAGE_CODES } from "./localization";
import { translateLanguageCodeText } from "./libreTranslate";

interface EntityFieldInput {
  fieldKey: string;
  value?: string | null;
  sourceLanguage?: LanguageCode | "AUTO";
}

interface EntityFieldTranslationRecord {
  fieldKey: string;
  language: LanguageCode;
  value: string;
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function resolveEnabledLanguages(organizationId?: string) {
  if (!organizationId) {
    return [...SUPPORTED_LANGUAGE_CODES];
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      defaultLanguage: true,
      enabledLanguages: true,
    },
  });

  const defaultLanguage = organization?.defaultLanguage ?? LanguageCode.EN;
  const enabledLanguages = Array.isArray(organization?.enabledLanguages)
    ? organization.enabledLanguages.filter((entry): entry is LanguageCode =>
        SUPPORTED_LANGUAGE_CODES.includes(entry as (typeof SUPPORTED_LANGUAGE_CODES)[number]),
      )
    : [];

  return Array.from(
    new Set([
      ...enabledLanguages,
      defaultLanguage,
      LanguageCode.EN,
    ]),
  );
}

async function buildFieldTranslations(
  value: string,
  languages: LanguageCode[],
  sourceLanguage: LanguageCode | "AUTO",
) {
  const translations = await Promise.all(
    languages.map(async (language) => ({
      language,
      value: (await translateLanguageCodeText(value, sourceLanguage, language)) ?? value,
    })),
  );

  return translations.filter((entry) => normalizeText(entry.value)) as Array<{ language: LanguageCode; value: string }>;
}

export async function syncEntityFieldTranslations(
  db: DbClient,
  args: {
    organizationId?: string;
    entityType: string;
    entityId: string;
    fields: EntityFieldInput[];
  },
) {
  const enabledLanguages = await resolveEnabledLanguages(args.organizationId);

  for (const field of args.fields) {
    const normalizedValue = normalizeText(field.value);

    if (!normalizedValue) {
      await db.entityFieldTranslation.deleteMany({
        where: {
          entityType: args.entityType,
          entityId: args.entityId,
          fieldKey: field.fieldKey,
        },
      });
      continue;
    }

    const translations = await buildFieldTranslations(
      normalizedValue,
      enabledLanguages,
      field.sourceLanguage ?? "AUTO",
    );

    for (const translation of translations) {
      await db.entityFieldTranslation.upsert({
        where: {
          entityType_entityId_fieldKey_language: {
            entityType: args.entityType,
            entityId: args.entityId,
            fieldKey: field.fieldKey,
            language: translation.language,
          },
        },
        create: {
          entityType: args.entityType,
          entityId: args.entityId,
          fieldKey: field.fieldKey,
          language: translation.language,
          value: translation.value,
        },
        update: {
          value: translation.value,
        },
      });
    }
  }
}

export async function listEntityFieldTranslations(
  entityType: string,
  entityIds: string[],
  fieldKeys?: string[],
) {
  if (entityIds.length === 0) {
    return [];
  }

  return prisma.entityFieldTranslation.findMany({
    where: {
      entityType,
      entityId: {
        in: entityIds,
      },
      ...(fieldKeys?.length ? { fieldKey: { in: fieldKeys } } : {}),
    },
    select: {
      entityId: true,
      fieldKey: true,
      language: true,
      value: true,
    },
  });
}

export function resolveEntityFieldValue(
  baseValue: string | null | undefined,
  translations: EntityFieldTranslationRecord[],
  fieldKey: string,
  localeContext: LocaleContext,
) {
  const translationByLanguage = new Map(
    translations
      .filter((translation) => translation.fieldKey === fieldKey)
      .map((translation) => [translation.language, translation.value]),
  );

  for (const language of localeContext.fallbackLanguages) {
    const translated = normalizeText(translationByLanguage.get(language));
    if (translated) {
      return translated;
    }
  }

  return normalizeText(baseValue);
}
