"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateText = translateText;
exports.buildTranslations = buildTranslations;
exports.translateLanguageCodeText = translateLanguageCodeText;
const crypto_1 = require("crypto");
const env_1 = require("../config/env");
const redis_1 = require("../config/redis");
const transliteration_1 = require("./transliteration");
const languageCodeToIso = {
    EN: "en",
    HI: "hi",
    GU: "gu",
};
const SUPPORTED_LANGUAGES_CACHE_TTL_MS = 5 * 60 * 1000;
let supportedLanguagesCache = null;
function toIsoLanguage(languageCode) {
    return languageCodeToIso[languageCode] ?? "en";
}
function hashText(value) {
    return (0, crypto_1.createHash)("sha256").update(value).digest("hex");
}
function buildPhraseCacheKey(source, target, value) {
    return `translation:phrase:${source}:${target}:${hashText(value)}`;
}
function buildTranslateUrl() {
    return `${env_1.env.LIBRETRANSLATE_URL.replace(/\/+$/, "")}/translate`;
}
function buildLanguagesUrl() {
    return `${env_1.env.LIBRETRANSLATE_URL.replace(/\/+$/, "")}/languages`;
}
async function getSupportedLanguagesTargets() {
    if (supportedLanguagesCache && supportedLanguagesCache.expiresAt > Date.now()) {
        return supportedLanguagesCache.targetsByLanguage;
    }
    const response = await fetch(buildLanguagesUrl(), {
        headers: {
            Accept: "application/json",
        },
        signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
        throw new Error(`LibreTranslate languages request failed with status ${response.status}`);
    }
    const payload = (await response.json().catch(() => null));
    if (!Array.isArray(payload)) {
        throw new Error("LibreTranslate returned an invalid languages response");
    }
    const targetsByLanguage = new Map(payload.map((language) => [language.code, new Set(language.targets ?? [])]));
    supportedLanguagesCache = {
        expiresAt: Date.now() + SUPPORTED_LANGUAGES_CACHE_TTL_MS,
        targetsByLanguage,
    };
    return targetsByLanguage;
}
async function isTranslationAvailable(source, target) {
    try {
        const targetsByLanguage = await getSupportedLanguagesTargets();
        if (!targetsByLanguage.has(target)) {
            return false;
        }
        if (source === "auto") {
            return true;
        }
        return targetsByLanguage.get(source)?.has(target) ?? false;
    }
    catch (error) {
        console.warn("LibreTranslate languages availability check failed", error);
        return true;
    }
}
async function requestLibreTranslate(value, source, target) {
    const body = new URLSearchParams({
        q: value,
        source,
        target,
        format: "text",
    });
    const response = await fetch(buildTranslateUrl(), {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(60_000),
    });
    const payload = (await response.json().catch(() => null));
    if (!response.ok) {
        throw new Error(payload?.error ?? `LibreTranslate request failed with status ${response.status}`);
    }
    if (!payload?.translatedText || typeof payload.translatedText !== "string") {
        throw new Error("LibreTranslate returned an invalid response");
    }
    return payload.translatedText;
}
async function translateText(value, targetLanguage, sourceLanguage = "auto") {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
        return normalizedValue;
    }
    if (sourceLanguage !== "auto" && sourceLanguage === targetLanguage) {
        return normalizedValue;
    }
    if (!(await isTranslationAvailable(sourceLanguage, targetLanguage))) {
        if (!env_1.env.AUTO_TRANSLATE_FAIL_OPEN) {
            throw new Error(`Translation from ${sourceLanguage} to ${targetLanguage} is not available`);
        }
        return normalizedValue;
    }
    const redis = (0, redis_1.getRedisClient)();
    const cacheKey = buildPhraseCacheKey(sourceLanguage, targetLanguage, normalizedValue);
    if (redis) {
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return cached;
            }
        }
        catch (error) {
            console.warn("Redis read failed for translation cache", error);
        }
    }
    let translatedText;
    try {
        translatedText = await requestLibreTranslate(normalizedValue, sourceLanguage, targetLanguage);
    }
    catch (error) {
        if (!env_1.env.AUTO_TRANSLATE_FAIL_OPEN) {
            throw error;
        }
        console.warn("LibreTranslate request failed; returning source text due to fail-open mode", {
            sourceLanguage,
            targetLanguage,
            error,
        });
        return normalizedValue;
    }
    if (redis) {
        try {
            await redis.set(cacheKey, translatedText, "EX", env_1.env.TRANSLATION_CACHE_TTL_SECONDS);
        }
        catch (error) {
            console.warn("Redis write failed for translation cache", error);
        }
    }
    return translatedText;
}
async function buildTranslations(value, sourceLanguage = "auto") {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
        throw new Error("Text is required");
    }
    const [en, hi, gu] = await Promise.all([
        translateText(normalizedValue, "en", sourceLanguage),
        translateText(normalizedValue, "hi", sourceLanguage),
        translateText(normalizedValue, "gu", sourceLanguage),
    ]);
    return { en, hi, gu };
}
async function translateLanguageCodeText(value, sourceLanguage, targetLanguage) {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
        return null;
    }
    if (sourceLanguage !== "AUTO" && sourceLanguage === targetLanguage) {
        return normalizedValue;
    }
    const glossaryTranslation = (0, transliteration_1.translateRomanizedInventoryText)(normalizedValue, targetLanguage);
    if (glossaryTranslation) {
        return glossaryTranslation;
    }
    return translateText(normalizedValue, toIsoLanguage(targetLanguage), sourceLanguage === "AUTO" ? "auto" : toIsoLanguage(sourceLanguage));
}
