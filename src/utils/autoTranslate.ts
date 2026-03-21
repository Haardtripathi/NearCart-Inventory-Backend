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
  const normalizedDefaultLanguage = SUPPORTED_LANGUAGE_CODES.includes(defaultLanguage as (typeof SUPPORTED_LANGUAGE_CODES)[number])
    ? defaultLanguage
    : LanguageCode.EN;

  if (!Array.isArray(value)) {
    return [normalizedDefaultLanguage, LanguageCode.EN];
  }

  const candidates = value.filter((entry): entry is LanguageCode =>
    SUPPORTED_LANGUAGE_CODES.includes(entry as (typeof SUPPORTED_LANGUAGE_CODES)[number]),
  );

  if (candidates.length === 0) {
    return [normalizedDefaultLanguage, LanguageCode.EN];
  }

  return Array.from(new Set([...candidates, normalizedDefaultLanguage, LanguageCode.EN]));
}

export async function enrichWithAutoTranslations<T extends TranslationLike>(args: {
  organizationId?: string;
  baseName: string;
  baseDescription?: string;
  sourceLanguage?: LanguageCode | "AUTO";
  existingTranslations?: T[];
}): Promise<T[]> {
  const existingTranslations = args.existingTranslations ?? [];

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

  const translationByLanguage = new Map(existingTranslations.map((translation) => [translation.language, translation]));

  const missingLanguages = enabledLanguages.filter(
    (language) => (sourceLanguage === "AUTO" || language !== sourceLanguage) && !translationByLanguage.has(language),
  );

  if (missingLanguages.length === 0) {
    return Array.from(translationByLanguage.values());
  }

  // Guarantee complete multilingual rows even when machine translation is disabled.
  if (!env.AUTO_TRANSLATE_ON_WRITE) {
    for (const language of missingLanguages) {
      translationByLanguage.set(language, {
        language,
        name: args.baseName,
        ...(args.baseDescription ? { description: args.baseDescription } : {}),
      } as T);
    }

    return Array.from(translationByLanguage.values());
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

        // Fail-open fallback keeps data complete for multilingual reads.
        return {
          language,
          name: args.baseName,
          ...(args.baseDescription ? { description: args.baseDescription } : {}),
        } as T;
      }
    }),
  );

  for (const translation of generatedResults) {
    if (translation) {
      translationByLanguage.set(translation.language, translation);
    }
  }

  for (const language of missingLanguages) {
    if (!translationByLanguage.has(language)) {
      translationByLanguage.set(language, {
        language,
        name: args.baseName,
        ...(args.baseDescription ? { description: args.baseDescription } : {}),
      } as T);
    }
  }

  return Array.from(translationByLanguage.values());
}
