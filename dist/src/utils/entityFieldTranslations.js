"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncEntityFieldTranslations = syncEntityFieldTranslations;
exports.listEntityFieldTranslations = listEntityFieldTranslations;
exports.resolveEntityFieldValue = resolveEntityFieldValue;
const client_1 = require("@prisma/client");
const prisma_1 = require("../config/prisma");
const env_1 = require("../config/env");
const localization_1 = require("./localization");
const libreTranslate_1 = require("./libreTranslate");
function normalizeText(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}
async function resolveEnabledLanguages(db, organizationId) {
    if (!organizationId) {
        return [...localization_1.SUPPORTED_LANGUAGE_CODES];
    }
    const organization = await db.organization.findUnique({
        where: { id: organizationId },
        select: {
            defaultLanguage: true,
            enabledLanguages: true,
        },
    });
    const defaultLanguage = organization?.defaultLanguage ?? client_1.LanguageCode.EN;
    const enabledLanguages = Array.isArray(organization?.enabledLanguages)
        ? organization.enabledLanguages.filter((entry) => localization_1.SUPPORTED_LANGUAGE_CODES.includes(entry))
        : [];
    return Array.from(new Set([
        ...enabledLanguages,
        defaultLanguage,
        client_1.LanguageCode.EN,
    ]));
}
async function buildFieldTranslations(value, languages, sourceLanguage) {
    // Machine translation on write is opt-in via AUTO_TRANSLATE_ON_WRITE (see enrichWithAutoTranslations,
    // which already gates the entity `translations` array the same way). Without this check, every write
    // that touches syncEntityFieldTranslations - user registration, org/branch creation, sales-order
    // notes/rejection reasons, purchase-receipt notes, stock-transfer notes, inventory adjustment notes,
    // etc. - made a blocking call to LibreTranslate on every request regardless of the flag, turning the
    // self-hosted Python service into a silent hard dependency for almost every write endpoint in the app.
    if (!env_1.env.AUTO_TRANSLATE_ON_WRITE) {
        return languages
            .map((language) => ({ language, value }))
            .filter((entry) => normalizeText(entry.value));
    }
    // Skip languages LibreTranslate has no model loaded for (see MACHINE_TRANSLATABLE_LANGUAGE_CODES) —
    // leave them absent rather than storing an untranslated echo mislabeled as that language.
    const translatableLanguages = languages.filter((language) => localization_1.MACHINE_TRANSLATABLE_LANGUAGE_CODES.includes(language));
    const translations = await Promise.all(translatableLanguages.map(async (language) => ({
        language,
        value: (await (0, libreTranslate_1.translateLanguageCodeText)(value, sourceLanguage, language)) ?? value,
    })));
    return translations.filter((entry) => normalizeText(entry.value));
}
async function syncEntityFieldTranslations(db, args) {
    const enabledLanguages = await resolveEnabledLanguages(db, args.organizationId);
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
        const translations = await buildFieldTranslations(normalizedValue, enabledLanguages, field.sourceLanguage ?? "AUTO");
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
async function listEntityFieldTranslations(entityType, entityIds, fieldKeys) {
    if (entityIds.length === 0) {
        return [];
    }
    return prisma_1.prisma.entityFieldTranslation.findMany({
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
function resolveEntityFieldValue(baseValue, translations, fieldKey, localeContext) {
    const translationByLanguage = new Map(translations
        .filter((translation) => translation.fieldKey === fieldKey)
        .map((translation) => [translation.language, translation.value]));
    for (const language of localeContext.fallbackLanguages) {
        const translated = normalizeText(translationByLanguage.get(language));
        if (translated) {
            return translated;
        }
    }
    return normalizeText(baseValue);
}
