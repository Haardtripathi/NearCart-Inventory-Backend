import { AuditAction } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { buildPagination, getPagination } from "../../utils/pagination";
import { createAuditLog } from "../audit/audit.service";

export async function listUnits(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
  },
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    OR: [
      {
        organizationId,
      },
      {
        organizationId: null,
        isSystem: true,
      },
    ],
    ...(query.search
      ? {
          AND: [
            {
              OR: [
                { name: { contains: query.search, mode: "insensitive" as const } },
                { code: { contains: query.search, mode: "insensitive" as const } },
                { symbol: { contains: query.search, mode: "insensitive" as const } },
              ],
            },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.unit.findMany({
      where,
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      skip,
      take: limit,
    }),
    prisma.unit.count({ where }),
  ]);

  return {
    items,
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createUnit(
  organizationId: string,
  actorUserId: string,
  input: {
    code: string;
    name: string;
    symbol?: string;
    allowsDecimal?: boolean;
  },
) {
  const existing = await prisma.unit.findFirst({
    where: {
      code: input.code.trim().toLowerCase(),
      OR: [
        { organizationId },
        { organizationId: null, isSystem: true },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict("Unit code already exists in this organization or as a system unit");
  }

  const unit = await prisma.unit.create({
    data: {
      organizationId,
      code: input.code.trim().toLowerCase(),
      name: input.name.trim(),
      symbol: input.symbol ?? null,
      allowsDecimal: input.allowsDecimal ?? true,
      isSystem: false,
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "Unit",
    entityId: unit.id,
    after: unit,
  });

  return unit;
}
