import { AuditAction } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { toNullableJsonValue } from "../../utils/json";
import { buildPagination, getPagination } from "../../utils/pagination";
import { createAuditLog } from "../audit/audit.service";

export async function listCustomers(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
    isActive?: boolean;
  },
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

  return {
    items,
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

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "Customer",
    entityId: customer.id,
    after: customer,
  });

  return customer;
}

export async function getCustomerById(organizationId: string, customerId: string) {
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
) {
  const existing = await getCustomerById(organizationId, customerId);

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

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "Customer",
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function deleteCustomer(organizationId: string, customerId: string, actorUserId: string) {
  const existing = await getCustomerById(organizationId, customerId);

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
