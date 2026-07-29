"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUniqueLanguages = getUniqueLanguages;
exports.mergeTranslationsForUpdate = mergeTranslationsForUpdate;
exports.upsertTranslations = upsertTranslations;
function getUniqueLanguages(entries) {
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
function mergeTranslationsForUpdate(existingTranslations, inputTranslations) {
    if (!inputTranslations || inputTranslations.length === 0) {
        return existingTranslations;
    }
    const merged = new Map();
    for (const translation of existingTranslations) {
        merged.set(translation.language, translation);
    }
    for (const translation of inputTranslations) {
        merged.set(translation.language, translation);
    }
    return Array.from(merged.values());
}
async function upsertTranslations(options) {
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
