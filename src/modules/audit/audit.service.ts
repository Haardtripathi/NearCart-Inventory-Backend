import { AuditAction } from "@prisma/client";

import { prisma } from "../../config/prisma";
import type { DbClient } from "../../types/prisma";
import { syncEntityFieldTranslations } from "../../utils/entityFieldTranslations";
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
  const auditLog = await db.auditLog.create({
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

  try {
    await syncEntityFieldTranslations(db, {
      organizationId: input.organizationId ?? undefined,
      entityType: "AuditLog",
      entityId: auditLog.id,
      fields: [{ fieldKey: "entityType", value: input.entityType }],
    });
  } catch (error) {
    // Audit-log creation is primary; translation sync must never block auth or writes.
    console.warn("Audit translation sync failed", {
      auditLogId: auditLog.id,
      entityType: input.entityType,
      error,
    });
  }

  return auditLog;
}

export async function listAuditLogs(organizationId: string, query: {
  page: number;
  limit: number;
  action?: AuditAction;
  entityType?: string;
  actor?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.actor
      ? {
          OR: [
            { actorUserId: query.actor },
            {
              actorUser: {
                is: {
                  fullName: { contains: query.actor, mode: "insensitive" as const },
                },
              },
            },
            {
              actorUser: {
                is: {
                  email: { contains: query.actor, mode: "insensitive" as const },
                },
              },
            },
          ],
        }
      : {}),
    ...(query.startDate || query.endDate
      ? {
          createdAt: {
            ...(query.startDate ? { gte: query.startDate } : {}),
            ...(query.endDate ? { lte: query.endDate } : {}),
          },
        }
      : {}),
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
