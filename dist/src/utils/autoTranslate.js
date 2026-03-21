"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichWithAutoTranslations = enrichWithAutoTranslations;
const client_1 = require("@prisma/client");
const prisma_1 = require("../config/prisma");
const env_1 = require("../config/env");
const libreTranslate_1 = require("./libreTranslate");
const localization_1 = require("./localization");
function parseEnabledLanguages(value, defaultLanguage) {
    if (!Array.isArray(value)) {
        return [defaultLanguage, client_1.LanguageCode.EN];
    }
    const candidates = value.filter((entry) => Object.values(client_1.LanguageCode).includes(entry));
    if (candidates.length === 0) {
        return [defaultLanguage, client_1.LanguageCode.EN];
    }
    return Array.from(new Set([...candidates, defaultLanguage, client_1.LanguageCode.EN]));
}
async function enrichWithAutoTranslations(args) {
    const existingTranslations = args.existingTranslations ?? [];
    if (!env_1.env.AUTO_TRANSLATE_ON_WRITE) {
        return existingTranslations;
    }
    const sourceLanguage = args.sourceLanguage ?? "AUTO";
    let enabledLanguages = [...localization_1.SUPPORTED_LANGUAGE_CODES];
    if (args.organizationId) {
        const organization = await prisma_1.prisma.organization.findUnique({
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
    const missingLanguages = enabledLanguages.filter((language) => (sourceLanguage === "AUTO" || language !== sourceLanguage) && !existingLanguageSet.has(language));
    if (missingLanguages.length === 0) {
        return existingTranslations;
    }
    const generatedResults = await Promise.all(missingLanguages.map(async (language) => {
        try {
            const [translatedName, translatedDescription] = await Promise.all([
                (0, libreTranslate_1.translateLanguageCodeText)(args.baseName, sourceLanguage, language),
                args.baseDescription ? (0, libreTranslate_1.translateLanguageCodeText)(args.baseDescription, sourceLanguage, language) : null,
            ]);
            if (!translatedName) {
                return null;
            }
            return {
                language,
                name: translatedName,
                ...(translatedDescription ? { description: translatedDescription } : {}),
            };
        }
        catch (error) {
            if (!env_1.env.AUTO_TRANSLATE_FAIL_OPEN) {
                throw error;
            }
            console.warn(`Auto translation failed for ${language}`, error);
            return null;
        }
    }));
    const generated = [];
    for (const translation of generatedResults) {
        if (translation) {
            generated.push(translation);
        }
    }
    return [...existingTranslations, ...generated];
}
