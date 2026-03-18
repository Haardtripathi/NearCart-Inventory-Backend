import { LanguageCode } from "@prisma/client";

export interface TranslationInput {
  language: LanguageCode;
}

interface TranslationRecord {
  id: string;
  language: LanguageCode;
}

interface UpsertTranslationsOptions<TInput extends TranslationInput, TExisting extends TranslationRecord> {
  entries: TInput[];
  listExisting: () => Promise<TExisting[]>;
  create: (entry: TInput) => Promise<unknown>;
  update: (existing: TExisting, entry: TInput) => Promise<unknown>;
}

export function getUniqueLanguages<TInput extends TranslationInput>(entries: TInput[]) {
  return Array.from(new Set(entries.map((entry) => entry.language)));
}

export async function upsertTranslations<TInput extends TranslationInput, TExisting extends TranslationRecord>(
  options: UpsertTranslationsOptions<TInput, TExisting>,
) {
  if (options.entries.length === 0) {
    return;
  }

  const existingItems = await options.listExisting();
  const existingByLanguage = new Map(existingItems.map((item) => [item.language, item]));

  for (const entry of options.entries) {
    const existing = existingByLanguage.get(entry.language);

    if (existing) {
      await options.update(existing, entry);
      continue;
    }

    await options.create(entry);
  }
}
