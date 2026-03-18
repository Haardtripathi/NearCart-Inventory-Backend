import { AuditAction } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { buildPagination, getPagination } from "../../utils/pagination";
import { slugify } from "../../utils/slug";
import { createAuditLog } from "../audit/audit.service";

export async function listBrands(
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
            { slug: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.brand.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.brand.count({ where }),
  ]);

  return {
    items,
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createBrand(
  organizationId: string,
  actorUserId: string,
  input: {
    name: string;
    slug?: string;
    isActive?: boolean;
  },
) {
  const brand = await prisma.brand.create({
    data: {
      organizationId,
      name: input.name.trim(),
      slug: slugify(input.slug ?? input.name),
      isActive: input.isActive ?? true,
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "Brand",
    entityId: brand.id,
    after: brand,
  });

  return brand;
}

export async function updateBrand(
  organizationId: string,
  brandId: string,
  actorUserId: string,
  input: Partial<{
    name: string;
    slug: string;
    isActive: boolean;
  }>,
) {
  const existing = await prisma.brand.findFirst({
    where: {
      id: brandId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw ApiError.notFound("Brand not found");
  }

  const updated = await prisma.brand.update({
    where: { id: brandId },
    data: {
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.slug ? { slug: slugify(input.slug) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "Brand",
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function deleteBrand(organizationId: string, brandId: string, actorUserId: string) {
  const existing = await prisma.brand.findFirst({
    where: {
      id: brandId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw ApiError.notFound("Brand not found");
  }

  const deleted = await prisma.brand.update({
    where: { id: brandId },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.DELETE,
    entityType: "Brand",
    entityId: deleted.id,
    before: existing,
    after: deleted,
  });

  return deleted;
}
