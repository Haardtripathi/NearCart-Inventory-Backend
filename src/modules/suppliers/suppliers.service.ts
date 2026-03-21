import { AuditAction, LanguageCode } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { toNullableJsonValue } from "../../utils/json";
import type { LocaleContext } from "../../utils/localization";
import { serializeLocalizedEntity } from "../../utils/localization";
import { buildPagination, getPagination } from "../../utils/pagination";
import { upsertTranslations } from "../../utils/translations";
import { enrichWithAutoTranslations } from "../../utils/autoTranslate";
import { createAuditLog } from "../audit/audit.service";

interface SupplierTranslationInput {
  language: LanguageCode;
  name: string;
}

function serializeSupplier(
  supplier: Awaited<ReturnType<typeof getSupplierRecordById>>,
  localeContext: LocaleContext,
) {
  return serializeLocalizedEntity(supplier, localeContext);
}

async function getSupplierRecordById(organizationId: string, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: {
      id: supplierId,
      organizationId,
      deletedAt: null,
    },
    include: {
      translations: {
        orderBy: {
          language: "asc",
        },
      },
    },
  });

  if (!supplier) {
    throw ApiError.notFound("Supplier not found");
  }

  return supplier;
}

export async function listSuppliers(
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
    deletedAt: null,
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { code: { contains: query.search, mode: "insensitive" as const } },
            { phone: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
            {
              translations: {
                some: {
                  name: { contains: query.search, mode: "insensitive" as const },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.supplier.findMany({
      where,
      include: {
        translations: {
          orderBy: {
            language: "asc",
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.supplier.count({ where }),
  ]);

  return {
    items: items.map((item) => serializeSupplier(item as Awaited<ReturnType<typeof getSupplierRecordById>>, localeContext)),
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createSupplier(
  organizationId: string,
  actorUserId: string,
  input: {
    name: string;
    code?: string;
    phone?: string;
    email?: string;
    taxNumber?: string;
    address?: unknown;
    notes?: string;
    isActive?: boolean;
    translations?: SupplierTranslationInput[];
  },
  localeContext: LocaleContext,
) {
  const translations = await enrichWithAutoTranslations<SupplierTranslationInput>({
    organizationId,
    baseName: input.name,
    existingTranslations: input.translations,
  });

  const supplier = await prisma.$transaction(async (tx) => {
    const created = await tx.supplier.create({
      data: {
        organizationId,
        name: input.name.trim(),
        code: input.code ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        taxNumber: input.taxNumber ?? null,
        address: toNullableJsonValue(input.address),
        notes: input.notes ?? null,
        isActive: input.isActive ?? true,
      },
    });

    if (translations.length) {
      await tx.supplierTranslation.createMany({
        data: translations.map((translation) => ({
          supplierId: created.id,
          language: translation.language,
          name: translation.name.trim(),
        })),
      });
    }

    return created;
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "Supplier",
    entityId: supplier.id,
    after: supplier,
  });

  return serializeSupplier(await getSupplierRecordById(organizationId, supplier.id), localeContext);
}

export async function getSupplierById(organizationId: string, supplierId: string, localeContext: LocaleContext) {
  return serializeSupplier(await getSupplierRecordById(organizationId, supplierId), localeContext);
}

export async function updateSupplier(
  organizationId: string,
  supplierId: string,
  actorUserId: string,
  input: Partial<{
    name: string;
    code: string;
    phone: string;
    email: string;
    taxNumber: string;
    address: unknown;
    notes: string;
    isActive: boolean;
    translations: SupplierTranslationInput[];
  }>,
  localeContext: LocaleContext,
) {
  const existing = await getSupplierRecordById(organizationId, supplierId);
  const translations = await enrichWithAutoTranslations<SupplierTranslationInput>({
    organizationId,
    baseName: input.name ?? existing.name,
    existingTranslations:
      input.translations ??
      existing.translations.map((translation) => ({
        language: translation.language,
        name: translation.name,
      })),
  });

  const updated = await prisma.$transaction(async (tx) => {
    const nextSupplier = await tx.supplier.update({
      where: { id: supplierId },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.code !== undefined ? { code: input.code || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.email !== undefined ? { email: input.email || null } : {}),
        ...(input.taxNumber !== undefined ? { taxNumber: input.taxNumber || null } : {}),
        ...(input.address !== undefined ? { address: toNullableJsonValue(input.address) } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await upsertTranslations({
      entries: translations,
      listExisting: () =>
        tx.supplierTranslation.findMany({
          where: {
            supplierId,
          },
          select: {
            id: true,
            language: true,
          },
        }),
      create: (translation) =>
        tx.supplierTranslation.create({
          data: {
            supplierId,
            language: translation.language,
            name: translation.name.trim(),
          },
        }),
      update: (current, translation) =>
        tx.supplierTranslation.update({
          where: { id: current.id },
          data: {
            name: translation.name.trim(),
          },
        }),
    });

    return nextSupplier;
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "Supplier",
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return serializeSupplier(await getSupplierRecordById(organizationId, updated.id), localeContext);
}

export async function deleteSupplier(organizationId: string, supplierId: string, actorUserId: string) {
  const existing = await getSupplierRecordById(organizationId, supplierId);

  const deleted = await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.DELETE,
    entityType: "Supplier",
    entityId: deleted.id,
    before: existing,
    after: deleted,
  });

  return deleted;
}
