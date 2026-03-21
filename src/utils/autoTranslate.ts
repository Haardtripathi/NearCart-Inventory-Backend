import { LanguageCode } from "@prisma/client";

import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { translateText } from "./libreTranslate";

interface TranslationLike {
  language: LanguageCode;
  name: string;
  description?: string;
}

function parseEnabledLanguages(value: unknown, defaultLanguage: LanguageCode): LanguageCode[] {
  if (!Array.isArray(value)) {
    return [defaultLanguage, LanguageCode.EN];
  }

  const candidates = value.filter((entry): entry is LanguageCode =>
    Object.values(LanguageCode).includes(entry as LanguageCode),
  );

  if (candidates.length === 0) {
    return [defaultLanguage, LanguageCode.EN];
  }

  return Array.from(new Set([...candidates, defaultLanguage, LanguageCode.EN]));
}

export async function enrichWithAutoTranslations<T extends TranslationLike>(args: {
  organizationId: string;
  baseName: string;
  baseDescription?: string;
  sourceLanguage?: LanguageCode;
  existingTranslations?: T[];
}): Promise<T[]> {
  const existingTranslations = args.existingTranslations ?? [];

  if (!env.AUTO_TRANSLATE_ON_WRITE) {
    return existingTranslations;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: args.organizationId },
    select: {
      defaultLanguage: true,
      enabledLanguages: true,
    },
  });

  if (!organization) {
    return existingTranslations;
  }

  const sourceLanguage = args.sourceLanguage ?? LanguageCode.EN;
  const enabledLanguages = parseEnabledLanguages(organization.enabledLanguages, organization.defaultLanguage);
  const existingLanguageSet = new Set(existingTranslations.map((translation) => translation.language));

  const missingLanguages = enabledLanguages.filter(
    (language) => language !== sourceLanguage && !existingLanguageSet.has(language),
  );

  if (missingLanguages.length === 0) {
    return existingTranslations;
  }

  const generated: T[] = [];

  for (const language of missingLanguages) {
    try {
      const translatedName = await translateText(args.baseName, sourceLanguage, language);
      if (!translatedName) {
        continue;
      }

      let translatedDescription: string | undefined = undefined;

      if (args.baseDescription) {
        translatedDescription = (await translateText(args.baseDescription, sourceLanguage, language)) ?? undefined;
      }

      generated.push({
        language,
        name: translatedName,
        ...(translatedDescription ? { description: translatedDescription } : {}),
      } as T);
    } catch (error) {
      if (!env.AUTO_TRANSLATE_FAIL_OPEN) {
        throw error;
      }

      console.warn(`Auto translation failed for ${language}`, error);
    }
  }

  return [...existingTranslations, ...generated];
}
