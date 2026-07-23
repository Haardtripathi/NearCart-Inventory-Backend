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

/**
 * Merges a partial translations update against the currently persisted translations.
 *
 * Callers building an "update" payload must not simply substitute `existingTranslations`
 * with the request's `translations` array: a caller that only sends one language (e.g.
 * `PATCH { translations: [{ language: "HI", name: "..." }] }`) is documented (see
 * MULTI_LANGUAGE_IMPLEMENTATION.md ยง4 "Only send languages you want to update") to leave
 * every other language untouched. Passing the raw partial array straight into
 * `enrichWithAutoTranslations` makes every language absent from the request look "missing",
 * which causes it to be regenerated/overwritten with the base name - silently destroying
 * any previously stored translation for languages not included in the request.
 *
 * This merges the two by language, with entries from `inputTranslations` overriding the
 * corresponding language in `existingTranslations`, and every other existing language
 * preserved as-is.
 */
export function mergeTranslationsForUpdate<TInput extends TranslationInput>(
  existingTranslations: TInput[],
  inputTranslations?: TInput[],
): TInput[] {
  if (!inputTranslations || inputTranslations.length === 0) {
    return existingTranslations;
  }

  const merged = new Map<LanguageCode, TInput>();

  for (const translation of existingTranslations) {
    merged.set(translation.language, translation);
  }

  for (const translation of inputTranslations) {
    merged.set(translation.language, translation);
  }

  return Array.from(merged.values());
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
