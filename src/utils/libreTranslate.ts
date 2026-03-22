import { createHash } from "crypto";
import { LanguageCode } from "@prisma/client";

import { env } from "../config/env";
import { getRedisClient } from "../config/redis";
import { translateRomanizedInventoryText } from "./transliteration";

const languageCodeToIso: Partial<Record<LanguageCode, TranslationTarget>> = {
  EN: "en",
  HI: "hi",
  GU: "gu",
};

type TranslationSource = TranslationTarget | "auto";
type TranslationTarget = "en" | "hi" | "gu";

interface LibreTranslateResponse {
  translatedText?: string;
  error?: string;
}

interface LibreTranslateLanguageResponse {
  code: string;
  targets?: string[];
}

const SUPPORTED_LANGUAGES_CACHE_TTL_MS = 5 * 60 * 1000;
let supportedLanguagesCache:
  | {
      expiresAt: number;
      targetsByLanguage: Map<string, Set<string>>;
    }
  | null = null;

function toIsoLanguage(languageCode: LanguageCode) {
  return languageCodeToIso[languageCode] ?? "en";
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildPhraseCacheKey(source: TranslationSource, target: TranslationTarget, value: string) {
  return `translation:phrase:${source}:${target}:${hashText(value)}`;
}

function buildTranslateUrl() {
  return `${env.LIBRETRANSLATE_URL.replace(/\/+$/, "")}/translate`;
}

function buildLanguagesUrl() {
  return `${env.LIBRETRANSLATE_URL.replace(/\/+$/, "")}/languages`;
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

  const payload = (await response.json().catch(() => null)) as LibreTranslateLanguageResponse[] | null;

  if (!Array.isArray(payload)) {
    throw new Error("LibreTranslate returned an invalid languages response");
  }

  const targetsByLanguage = new Map(
    payload.map((language) => [language.code, new Set(language.targets ?? [])]),
  );

  supportedLanguagesCache = {
    expiresAt: Date.now() + SUPPORTED_LANGUAGES_CACHE_TTL_MS,
    targetsByLanguage,
  };

  return targetsByLanguage;
}

async function isTranslationAvailable(source: TranslationSource, target: TranslationTarget) {
  try {
    const targetsByLanguage = await getSupportedLanguagesTargets();

    if (!targetsByLanguage.has(target)) {
      return false;
    }

    if (source === "auto") {
      return true;
    }

    return targetsByLanguage.get(source)?.has(target) ?? false;
  } catch (error) {
    console.warn("LibreTranslate languages availability check failed", error);
    return true;
  }
}

async function requestLibreTranslate(
  value: string,
  source: TranslationSource,
  target: TranslationTarget,
): Promise<string> {
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

  const payload = (await response.json().catch(() => null)) as LibreTranslateResponse | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `LibreTranslate request failed with status ${response.status}`);
  }

  if (!payload?.translatedText || typeof payload.translatedText !== "string") {
    throw new Error("LibreTranslate returned an invalid response");
  }

  return payload.translatedText;
}

export async function translateText(
  value: string,
  targetLanguage: TranslationTarget,
  sourceLanguage: TranslationSource = "auto",
): Promise<string> {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return normalizedValue;
  }

  if (sourceLanguage !== "auto" && sourceLanguage === targetLanguage) {
    return normalizedValue;
  }

  if (!(await isTranslationAvailable(sourceLanguage, targetLanguage))) {
    if (!env.AUTO_TRANSLATE_FAIL_OPEN) {
      throw new Error(`Translation from ${sourceLanguage} to ${targetLanguage} is not available`);
    }
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

  const translatedText = await requestLibreTranslate(normalizedValue, sourceLanguage, targetLanguage);

  if (redis) {
    try {
      await redis.set(cacheKey, translatedText, "EX", env.TRANSLATION_CACHE_TTL_SECONDS);
    } catch (error) {
      console.warn("Redis write failed for translation cache", error);
    }
  }

  return translatedText;
}

export async function buildTranslations(value: string, sourceLanguage: TranslationSource = "auto") {
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

export async function translateLanguageCodeText(
  value: string,
  sourceLanguage: LanguageCode | "AUTO",
  targetLanguage: LanguageCode,
): Promise<string | null> {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (sourceLanguage !== "AUTO" && sourceLanguage === targetLanguage) {
    return normalizedValue;
  }

  const glossaryTranslation = translateRomanizedInventoryText(normalizedValue, targetLanguage);
  if (glossaryTranslation) {
    return glossaryTranslation;
  }

  return translateText(
    normalizedValue,
    toIsoLanguage(targetLanguage),
    sourceLanguage === "AUTO" ? "auto" : toIsoLanguage(sourceLanguage),
  );
}
