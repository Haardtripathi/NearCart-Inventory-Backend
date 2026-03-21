"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateText = translateText;
const crypto_1 = require("crypto");
const libretranslate_ts_1 = require("libretranslate-ts");
const env_1 = require("../config/env");
const redis_1 = require("../config/redis");
const languageCodeToIso = {
    EN: "en",
    HI: "hi",
    GU: "gu",
};
function toIsoLanguage(languageCode) {
    return languageCodeToIso[languageCode] ?? "en";
}
function hashText(value) {
    return (0, crypto_1.createHash)("sha256").update(value).digest("hex");
}
function buildPhraseCacheKey(source, target, value) {
    return `translation:phrase:${source}:${target}:${hashText(value)}`;
}
libretranslate_ts_1.libreTranslate.setApiEndpoint(env_1.env.LIBRETRANSLATE_ENDPOINT);
libretranslate_ts_1.libreTranslate.setApiKey(env_1.env.LIBRETRANSLATE_API_KEY ?? "");
async function translateText(value, sourceLanguage, targetLanguage) {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
        return null;
    }
    if (sourceLanguage === targetLanguage) {
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
    const result = await libretranslate_ts_1.libreTranslate.translate(normalizedValue, toIsoLanguage(sourceLanguage), toIsoLanguage(targetLanguage));
    if (result.status >= 400 || !result.translatedText) {
        const message = result.error ?? "Translation failed";
        throw new Error(message);
    }
    if (redis) {
        try {
            await redis.set(cacheKey, result.translatedText, "EX", env_1.env.TRANSLATION_CACHE_TTL_SECONDS);
        }
        catch (error) {
            console.warn("Redis write failed for translation cache", error);
        }
    }
    return result.translatedText;
}
