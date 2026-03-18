"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUniqueLanguages = getUniqueLanguages;
exports.upsertTranslations = upsertTranslations;
function getUniqueLanguages(entries) {
    return Array.from(new Set(entries.map((entry) => entry.language)));
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
