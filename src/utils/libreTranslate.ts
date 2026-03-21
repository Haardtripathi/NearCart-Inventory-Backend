import { createHash } from "crypto";
import { libreTranslate } from "libretranslate-ts";
import { LanguageCode } from "@prisma/client";

import { env } from "../config/env";
import { getRedisClient } from "../config/redis";

const languageCodeToIso: Record<LanguageCode, string> = {
  EN: "en",
  HI: "hi",
  GU: "gu",
};

function toIsoLanguage(languageCode: LanguageCode) {
  return languageCodeToIso[languageCode] ?? "en";
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildPhraseCacheKey(source: LanguageCode, target: LanguageCode, value: string) {
  return `translation:phrase:${source}:${target}:${hashText(value)}`;
}

libreTranslate.setApiEndpoint(env.LIBRETRANSLATE_ENDPOINT);
libreTranslate.setApiKey(env.LIBRETRANSLATE_API_KEY ?? "");

export async function translateText(
  value: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
): Promise<string | null> {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (sourceLanguage === targetLanguage) {
    return normalizedValue;
  }

  const redis = getRedisClient();
  const cacheKey = buildPhraseCacheKey(sourceLanguage, targetLanguage, normalizedValue);

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      console.warn("Redis read failed for translation cache", error);
    }
  }

  const result = await libreTranslate.translate(
    normalizedValue,
    toIsoLanguage(sourceLanguage),
    toIsoLanguage(targetLanguage),
  );

  if (result.status >= 400 || !result.translatedText) {
    const message = result.error ?? "Translation failed";
    throw new Error(message);
  }

  if (redis) {
    try {
      await redis.set(cacheKey, result.translatedText, "EX", env.TRANSLATION_CACHE_TTL_SECONDS);
    } catch (error) {
      console.warn("Redis write failed for translation cache", error);
    }
  }

  return result.translatedText;
}
