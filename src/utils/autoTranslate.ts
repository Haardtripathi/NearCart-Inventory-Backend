import { LanguageCode } from "@prisma/client";

import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { translateLanguageCodeText } from "./libreTranslate";
import { SUPPORTED_LANGUAGE_CODES } from "./localization";

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
  organizationId?: string;
  baseName: string;
  baseDescription?: string;
  sourceLanguage?: LanguageCode | "AUTO";
  existingTranslations?: T[];
}): Promise<T[]> {
  const existingTranslations = args.existingTranslations ?? [];

  if (!env.AUTO_TRANSLATE_ON_WRITE) {
    return existingTranslations;
  }

  const sourceLanguage = args.sourceLanguage ?? "AUTO";
  let enabledLanguages: LanguageCode[] = [...SUPPORTED_LANGUAGE_CODES];

  if (args.organizationId) {
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

    enabledLanguages = parseEnabledLanguages(organization.enabledLanguages, organization.defaultLanguage);
  }

  const existingLanguageSet = new Set(existingTranslations.map((translation) => translation.language));

  const missingLanguages = enabledLanguages.filter(
    (language) => (sourceLanguage === "AUTO" || language !== sourceLanguage) && !existingLanguageSet.has(language),
  );

  if (missingLanguages.length === 0) {
    return existingTranslations;
  }

  const generatedResults = await Promise.all(
    missingLanguages.map(async (language) => {
      try {
        const [translatedName, translatedDescription] = await Promise.all([
          translateLanguageCodeText(args.baseName, sourceLanguage, language),
          args.baseDescription ? translateLanguageCodeText(args.baseDescription, sourceLanguage, language) : null,
        ]);

        if (!translatedName) {
          return null;
        }

        return {
          language,
          name: translatedName,
          ...(translatedDescription ? { description: translatedDescription } : {}),
        } as T;
      } catch (error) {
        if (!env.AUTO_TRANSLATE_FAIL_OPEN) {
          throw error;
        }

        console.warn(`Auto translation failed for ${language}`, error);
        return null;
      }
    }),
  );

  const generated: T[] = [];

  for (const translation of generatedResults) {
    if (translation) {
      generated.push(translation);
    }
  }

  return [...existingTranslations, ...generated];
}
