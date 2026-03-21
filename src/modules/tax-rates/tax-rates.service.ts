import { AuditAction } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { toDecimal } from "../../utils/decimal";
import { ApiError } from "../../utils/ApiError";
import {
  listEntityFieldTranslations,
  resolveEntityFieldValue,
  syncEntityFieldTranslations,
} from "../../utils/entityFieldTranslations";
import type { LocaleContext } from "../../utils/localization";
import { serializeLocalizedEntity } from "../../utils/localization";
import { buildPagination, getPagination } from "../../utils/pagination";
import { createAuditLog } from "../audit/audit.service";

function serializeTaxRate<TTaxRate extends { id: string; name: string }>(
  taxRate: TTaxRate,
  localeContext: LocaleContext,
  translations: Array<{ fieldKey: string; language: import("@prisma/client").LanguageCode; value: string }> = [],
) {
  return {
    ...serializeLocalizedEntity(taxRate, localeContext),
    displayName: resolveEntityFieldValue(taxRate.name, translations, "name", localeContext) ?? taxRate.name,
  };
}

export async function listTaxRates(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
    isActive?: boolean;
  },
  localeContext: LocaleContext,
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { code: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.taxRate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.taxRate.count({ where }),
  ]);

  const translations = await listEntityFieldTranslations(
    "TaxRate",
    items.map((taxRate) => taxRate.id),
    ["name"],
  );
  const translationsByEntityId = new Map<string, typeof translations>();

  for (const translation of translations) {
    const bucket = translationsByEntityId.get(translation.entityId) ?? [];
    bucket.push(translation);
    translationsByEntityId.set(translation.entityId, bucket);
  }

  return {
    items: items.map((taxRate) => serializeTaxRate(taxRate, localeContext, translationsByEntityId.get(taxRate.id) ?? [])),
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createTaxRate(
  organizationId: string,
  actorUserId: string,
  input: {
    name: string;
    code?: string;
    rate: string | number;
    isInclusive?: boolean;
    isActive?: boolean;
  },
  localeContext: LocaleContext,
) {
  const taxRate = await prisma.taxRate.create({
    data: {
      organizationId,
      name: input.name.trim(),
      code: input.code ?? null,
      rate: toDecimal(input.rate),
      isInclusive: input.isInclusive ?? false,
      isActive: input.isActive ?? true,
    },
  });

  await syncEntityFieldTranslations(prisma, {
    organizationId,
    entityType: "TaxRate",
    entityId: taxRate.id,
    fields: [{ fieldKey: "name", value: input.name }],
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "TaxRate",
    entityId: taxRate.id,
    after: taxRate,
  });

  return serializeTaxRate(taxRate, localeContext);
}

export async function updateTaxRate(
  organizationId: string,
  taxRateId: string,
  actorUserId: string,
  input: Partial<{
    name: string;
    code: string;
    rate: string | number;
    isInclusive: boolean;
    isActive: boolean;
  }>,
  localeContext: LocaleContext,
) {
  const existing = await prisma.taxRate.findFirst({
    where: {
      id: taxRateId,
      organizationId,
    },
  });

  if (!existing) {
    throw ApiError.notFound("Tax rate not found");
  }

  const updated = await prisma.taxRate.update({
    where: { id: taxRateId },
    data: {
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.code !== undefined ? { code: input.code || null } : {}),
      ...(input.rate !== undefined ? { rate: toDecimal(input.rate) } : {}),
      ...(input.isInclusive !== undefined ? { isInclusive: input.isInclusive } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await syncEntityFieldTranslations(prisma, {
    organizationId,
    entityType: "TaxRate",
    entityId: updated.id,
    fields: [{ fieldKey: "name", value: input.name ?? updated.name }],
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "TaxRate",
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return serializeTaxRate(updated, localeContext);
}
