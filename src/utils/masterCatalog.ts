import { LanguageCode } from "@prisma/client";

function normalizeSearchValue(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeMasterCatalogAliasValues(
  aliases: Array<{
    language: LanguageCode;
    value: string;
  }>,
) {
  const seen = new Set<string>();

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

export function buildMasterItemSearchText(input: {
  canonicalName: string;
  code: string;
  slug: string;
  translations?: Array<{
    name?: string | null;
    shortName?: string | null;
  }>;
  aliases?: Array<{
    value: string;
  }>;
}) {
  const values = [
    input.canonicalName,
    input.code,
    input.slug,
    ...(input.translations ?? []).flatMap((translation) => [translation.name, translation.shortName]),
    ...(input.aliases ?? []).map((alias) => alias.value),
  ]
    .map((value) => normalizeSearchValue(value))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(values)).join(" ");
}
