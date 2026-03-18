"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMasterCatalogAliasValues = normalizeMasterCatalogAliasValues;
exports.buildMasterItemSearchText = buildMasterItemSearchText;
function normalizeSearchValue(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
}
function normalizeMasterCatalogAliasValues(aliases) {
    const seen = new Set();
    return aliases.filter((alias) => {
        const normalizedValue = normalizeSearchValue(alias.value);
        if (!normalizedValue) {
            return false;
        }
        const key = `${alias.language}:${normalizedValue}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
function buildMasterItemSearchText(input) {
    const values = [
        input.canonicalName,
        input.code,
        input.slug,
        ...(input.translations ?? []).flatMap((translation) => [translation.name, translation.shortName]),
        ...(input.aliases ?? []).map((alias) => alias.value),
    ]
        .map((value) => normalizeSearchValue(value))
        .filter((value) => Boolean(value));
    return Array.from(new Set(values)).join(" ");
}
