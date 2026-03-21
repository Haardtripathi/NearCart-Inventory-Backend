import type { Request } from "express";
import { LanguageCode } from "@prisma/client";

import { prisma } from "../config/prisma";

export const SUPPORTED_LANGUAGE_CODES = [LanguageCode.EN, LanguageCode.HI, LanguageCode.GU] as const;

function sanitizeSupportedLanguageCode(value: LanguageCode | null | undefined): LanguageCode | null {
  return value && SUPPORTED_LANGUAGE_CODES.includes(value as (typeof SUPPORTED_LANGUAGE_CODES)[number]) ? value : null;
}

export interface LocaleContext {
  requestedLanguage: LanguageCode | null;
  resolvedLanguage: LanguageCode;
  orgDefaultLanguage: LanguageCode | null;
  userPreferredLanguage: LanguageCode | null;
  fallbackLanguages: LanguageCode[];
}

export interface LocalizedTextResult {
  displayName: string | null;
  displayDescription?: string | null;
  resolvedLanguage: LanguageCode;
}

interface TranslationRecordBase {
  language: LanguageCode;
}

interface ResolveLocalizedTextArgs<TTranslation extends TranslationRecordBase> {
  baseName?: string | null;
  baseDescription?: string | null;
  translations: TTranslation[];
  context: LocaleContext;
  getName: (translation: TTranslation) => string | null | undefined;
  getDescription?: (translation: TTranslation) => string | null | undefined;
}

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeLanguageCode(value: string | null | undefined): LanguageCode | null {
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
      return LanguageCode.EN;
    case "hi":
      return LanguageCode.HI;
    case "gu":
      return LanguageCode.GU;
    default:
      return null;
  }
}

export function parseAcceptLanguageHeader(headerValue: string | null | undefined): LanguageCode | null {
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
    .filter((entry): entry is { index: number; language: LanguageCode; weight: number } => Boolean(entry.language))
    .sort((left, right) => {
      if (right.weight === left.weight) {
        return left.index - right.index;
      }

      return right.weight - left.weight;
    });

  return parsed[0]?.language ?? null;
}

export async function resolveLocaleContext(
  req: Request,
  options?: {
    organizationId?: string | null;
    organizationDefaultLanguage?: LanguageCode | null;
  },
): Promise<LocaleContext> {
  const queryLanguage =
    typeof req.query.lang === "string" ? normalizeLanguageCode(req.query.lang) : null;
  const headerLanguage = parseAcceptLanguageHeader(
    typeof req.headers["accept-language"] === "string" ? req.headers["accept-language"] : null,
  );
  const requestedLanguage = queryLanguage ?? headerLanguage;
  const userPreferredLanguage = sanitizeSupportedLanguageCode(req.auth?.userPreferredLanguage ?? null);

  let orgDefaultLanguage = sanitizeSupportedLanguageCode(
    options?.organizationDefaultLanguage ??
      req.activeOrganization?.defaultLanguage ??
      req.auth?.activeOrganizationDefaultLanguage ??
      null,
  );

  const organizationId = options?.organizationId ?? req.activeOrganization?.id ?? req.auth?.activeOrganizationId ?? null;

  if (!orgDefaultLanguage && organizationId) {
    const organization = await prisma.organization.findFirst({
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

  const resolvedLanguage = requestedLanguage ?? userPreferredLanguage ?? orgDefaultLanguage ?? LanguageCode.EN;
  const fallbackLanguages = Array.from(
    new Set([resolvedLanguage, orgDefaultLanguage ?? null, LanguageCode.EN].filter(Boolean)),
  ) as LanguageCode[];

  return {
    requestedLanguage,
    resolvedLanguage,
    orgDefaultLanguage,
    userPreferredLanguage,
    fallbackLanguages,
  };
}

export function resolveLocalizedText<TTranslation extends TranslationRecordBase>(
  args: ResolveLocalizedTextArgs<TTranslation>,
): LocalizedTextResult {
  const normalizedBaseName = normalizeText(args.baseName);
  const normalizedBaseDescription = normalizeText(args.baseDescription);
  const translationByLanguage = new Map(args.translations.map((translation) => [translation.language, translation]));

  let displayName: string | null = null;
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

  let displayDescription: string | null | undefined = undefined;

  if (args.getDescription || normalizedBaseDescription) {
    displayDescription = null;

    for (const language of args.context.fallbackLanguages) {
      const translation = translationByLanguage.get(language);
      const localizedDescription =
        translation && args.getDescription ? normalizeText(args.getDescription(translation)) : null;

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

export function serializeLocalizedEntity<
  TTranslation extends TranslationRecordBase,
  TEntity extends {
    name?: string | null;
    description?: string | null;
    translations?: TTranslation[];
  },
>(
  entity: TEntity,
  context: LocaleContext,
  selectors?: {
    getName?: (translation: TTranslation) => string | null | undefined;
    getDescription?: (translation: TTranslation) => string | null | undefined;
  },
) {
  const localized = resolveLocalizedText({
    baseName: entity.name,
    baseDescription: entity.description,
    translations: entity.translations ?? [],
    context,
    getName: selectors?.getName ?? ((translation) => (translation as TTranslation & { name?: string | null }).name),
    getDescription:
      selectors?.getDescription ??
      ((translation) => (translation as TTranslation & { description?: string | null }).description),
  });

  return {
    ...entity,
    displayName: localized.displayName,
    displayDescription: localized.displayDescription,
    resolvedLanguage: localized.resolvedLanguage,
  };
}
