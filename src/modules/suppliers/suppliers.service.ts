import { AuditAction } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { toNullableJsonValue } from "../../utils/json";
import { buildPagination, getPagination } from "../../utils/pagination";
import { createAuditLog } from "../audit/audit.service";

export async function listSuppliers(
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
            { code: { contains: query.search, mode: "insensitive" as const } },
            { phone: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.supplier.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.supplier.count({ where }),
  ]);

  return {
    items,
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
  },
) {
  const supplier = await prisma.supplier.create({
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

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "Supplier",
    entityId: supplier.id,
    after: supplier,
  });

  return supplier;
}

export async function getSupplierById(organizationId: string, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: {
      id: supplierId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!supplier) {
    throw ApiError.notFound("Supplier not found");
  }

  return supplier;
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
  }>,
) {
  const existing = await getSupplierById(organizationId, supplierId);

  const updated = await prisma.supplier.update({
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

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "Supplier",
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function deleteSupplier(organizationId: string, supplierId: string, actorUserId: string) {
  const existing = await getSupplierById(organizationId, supplierId);

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
