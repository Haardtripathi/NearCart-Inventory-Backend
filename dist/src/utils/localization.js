"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_LANGUAGE_CODES = void 0;
exports.normalizeLanguageCode = normalizeLanguageCode;
exports.parseAcceptLanguageHeader = parseAcceptLanguageHeader;
exports.resolveLocaleContext = resolveLocaleContext;
exports.resolveLocalizedText = resolveLocalizedText;
exports.serializeLocalizedEntity = serializeLocalizedEntity;
const client_1 = require("@prisma/client");
const prisma_1 = require("../config/prisma");
exports.SUPPORTED_LANGUAGE_CODES = [client_1.LanguageCode.EN, client_1.LanguageCode.HI, client_1.LanguageCode.GU];
function sanitizeSupportedLanguageCode(value) {
    return value && exports.SUPPORTED_LANGUAGE_CODES.includes(value) ? value : null;
}
function normalizeText(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function normalizeLanguageCode(value) {
    if (typeof value !== "string") {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    const [primaryTag] = normalized.split("-");
    switch (primaryTag) {
        case "en":
            return client_1.LanguageCode.EN;
        case "hi":
            return client_1.LanguageCode.HI;
        case "gu":
            return client_1.LanguageCode.GU;
        default:
            return null;
    }
}
function parseAcceptLanguageHeader(headerValue) {
    if (!headerValue) {
        return null;
    }
    const parsed = headerValue
        .split(",")
        .map((part, index) => {
        const [rawLanguage, ...params] = part.trim().split(";");
        const qValue = params.find((param) => param.trim().startsWith("q="));
        const weight = qValue ? Number(qValue.split("=")[1]) : 1;
        return {
            index,
            language: normalizeLanguageCode(rawLanguage),
            weight: Number.isFinite(weight) ? weight : 0,
        };
    })
        .filter((entry) => Boolean(entry.language))
        .sort((left, right) => {
        if (right.weight === left.weight) {
            return left.index - right.index;
        }
        return right.weight - left.weight;
    });
    return parsed[0]?.language ?? null;
}
async function resolveLocaleContext(req, options) {
    const queryLanguage = typeof req.query.lang === "string" ? normalizeLanguageCode(req.query.lang) : null;
    const headerLanguage = parseAcceptLanguageHeader(typeof req.headers["accept-language"] === "string" ? req.headers["accept-language"] : null);
    const requestedLanguage = queryLanguage ?? headerLanguage;
    const userPreferredLanguage = sanitizeSupportedLanguageCode(req.auth?.userPreferredLanguage ?? null);
    let orgDefaultLanguage = sanitizeSupportedLanguageCode(options?.organizationDefaultLanguage ??
        req.activeOrganization?.defaultLanguage ??
        req.auth?.activeOrganizationDefaultLanguage ??
        null);
    const organizationId = options?.organizationId ?? req.activeOrganization?.id ?? req.auth?.activeOrganizationId ?? null;
    if (!orgDefaultLanguage && organizationId) {
        const organization = await prisma_1.prisma.organization.findFirst({
            where: {
                id: organizationId,
                deletedAt: null,
            },
            select: {
                defaultLanguage: true,
            },
        });
        orgDefaultLanguage = sanitizeSupportedLanguageCode(organization?.defaultLanguage ?? null);
    }
    const resolvedLanguage = requestedLanguage ?? userPreferredLanguage ?? orgDefaultLanguage ?? client_1.LanguageCode.EN;
    const fallbackLanguages = Array.from(new Set([resolvedLanguage, orgDefaultLanguage ?? null, client_1.LanguageCode.EN].filter(Boolean)));
    return {
        requestedLanguage,
        resolvedLanguage,
        orgDefaultLanguage,
        userPreferredLanguage,
        fallbackLanguages,
    };
}
function resolveLocalizedText(args) {
    const normalizedBaseName = normalizeText(args.baseName);
    const normalizedBaseDescription = normalizeText(args.baseDescription);
    const translationByLanguage = new Map(args.translations.map((translation) => [translation.language, translation]));
    let displayName = null;
    let resolvedLanguage = args.context.resolvedLanguage;
    for (const language of args.context.fallbackLanguages) {
        const translation = translationByLanguage.get(language);
        const localizedName = translation ? normalizeText(args.getName(translation)) : null;
        if (localizedName) {
            displayName = localizedName;
            resolvedLanguage = language;
            break;
        }
    }
    if (!displayName) {
        displayName = normalizedBaseName;
    }
    let displayDescription = undefined;
    if (args.getDescription || normalizedBaseDescription) {
        displayDescription = null;
        for (const language of args.context.fallbackLanguages) {
            const translation = translationByLanguage.get(language);
            const localizedDescription = translation && args.getDescription ? normalizeText(args.getDescription(translation)) : null;
            if (localizedDescription) {
                displayDescription = localizedDescription;
                break;
            }
        }
        if (!displayDescription) {
            displayDescription = normalizedBaseDescription;
        }
    }
    return {
        displayName,
        displayDescription,
        resolvedLanguage,
    };
}
function serializeLocalizedEntity(entity, context, selectors) {
    const localized = resolveLocalizedText({
        baseName: entity.name,
        baseDescription: entity.description,
        translations: entity.translations ?? [],
        context,
        getName: selectors?.getName ?? ((translation) => translation.name),
        getDescription: selectors?.getDescription ??
            ((translation) => translation.description),
    });
    return {
        ...entity,
        displayName: localized.displayName,
        displayDescription: localized.displayDescription,
        resolvedLanguage: localized.resolvedLanguage,
    };
}
