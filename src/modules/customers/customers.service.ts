import { AuditAction } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import {
  listEntityFieldTranslations,
  resolveEntityFieldValue,
  syncEntityFieldTranslations,
} from "../../utils/entityFieldTranslations";
import { toNullableJsonValue } from "../../utils/json";
import type { LocaleContext } from "../../utils/localization";
import { serializeLocalizedEntity } from "../../utils/localization";
import { buildPagination, getPagination } from "../../utils/pagination";
import { createAuditLog } from "../audit/audit.service";

function serializeCustomer<TCustomer extends { id: string; name: string }>(
  customer: TCustomer,
  localeContext: LocaleContext,
  translations: Array<{ fieldKey: string; language: import("@prisma/client").LanguageCode; value: string }> = [],
) {
  return {
    ...serializeLocalizedEntity(customer, localeContext),
    displayName: resolveEntityFieldValue(customer.name, translations, "name", localeContext) ?? customer.name,
  };
}

export async function listCustomers(
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
            { phone: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  const translations = await listEntityFieldTranslations(
    "Customer",
    items.map((customer) => customer.id),
    ["name"],
  );
  const translationsByEntityId = new Map<string, typeof translations>();

  for (const translation of translations) {
    const bucket = translationsByEntityId.get(translation.entityId) ?? [];
    bucket.push(translation);
    translationsByEntityId.set(translation.entityId, bucket);
  }

  return {
    items: items.map((customer) => serializeCustomer(customer, localeContext, translationsByEntityId.get(customer.id) ?? [])),
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createCustomer(
  organizationId: string,
  actorUserId: string,
  input: {
    name: string;
    phone?: string;
    email?: string;
    address?: unknown;
    notes?: string;
    isActive?: boolean;
  },
  localeContext: LocaleContext,
) {
  const customer = await prisma.customer.create({
    data: {
      organizationId,
      name: input.name.trim(),
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: toNullableJsonValue(input.address),
      notes: input.notes ?? null,
      isActive: input.isActive ?? true,
    },
  });

  await syncEntityFieldTranslations(prisma, {
    organizationId,
    entityType: "Customer",
    entityId: customer.id,
    fields: [
      { fieldKey: "name", value: input.name },
      { fieldKey: "notes", value: input.notes },
    ],
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "Customer",
    entityId: customer.id,
    after: customer,
  });

  return serializeCustomer(customer, localeContext);
}

async function getCustomerRecordById(organizationId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!customer) {
    throw ApiError.notFound("Customer not found");
  }

  return customer;
}

export async function getCustomerById(organizationId: string, customerId: string, localeContext: LocaleContext) {
  const customer = await getCustomerRecordById(organizationId, customerId);
  const translations = await listEntityFieldTranslations("Customer", [customer.id], ["name"]);
  return serializeCustomer(customer, localeContext, translations);
}

export async function updateCustomer(
  organizationId: string,
  customerId: string,
  actorUserId: string,
  input: Partial<{
    name: string;
    phone: string;
    email: string;
    address: unknown;
    notes: string;
    isActive: boolean;
  }>,
  localeContext: LocaleContext,
) {
  const existing = await getCustomerRecordById(organizationId, customerId);

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.address !== undefined ? { address: toNullableJsonValue(input.address) } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await syncEntityFieldTranslations(prisma, {
    organizationId,
    entityType: "Customer",
    entityId: updated.id,
    fields: [
      { fieldKey: "name", value: input.name ?? updated.name },
      { fieldKey: "notes", value: input.notes ?? updated.notes },
    ],
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "Customer",
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return serializeCustomer(updated, localeContext);
}

export async function deleteCustomer(organizationId: string, customerId: string, actorUserId: string) {
  const existing = await getCustomerRecordById(organizationId, customerId);

  const deleted = await prisma.customer.update({
    where: { id: customerId },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.DELETE,
    entityType: "Customer",
    entityId: deleted.id,
    before: existing,
    after: deleted,
  });

  return deleted;
}
