import { AuditAction } from "@prisma/client";

import { prisma } from "../../config/prisma";
import type { DbClient } from "../../types/prisma";
import { buildPagination, getPagination } from "../../utils/pagination";
import { toNullableJsonValue } from "../../utils/json";

interface AuditLogInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createAuditLog(db: DbClient, input: AuditLogInput) {
  return db.auditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: toNullableJsonValue(input.before),
      after: toNullableJsonValue(input.after),
      meta: toNullableJsonValue(input.meta),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function listAuditLogs(organizationId: string, query: {
  page: number;
  limit: number;
  action?: AuditAction;
  entityType?: string;
}) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: {
        actorUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items,
    pagination: buildPagination(page, limit, totalItems),
  };
}
