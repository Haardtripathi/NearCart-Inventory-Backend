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

  // Note: this used to call syncEntityFieldTranslations() to "translate" input.entityType
  // (e.g. the literal string "Brand"/"Product") into HI/GU on every single audit log write -
  // an internal type discriminator, never read back anywhere (grep confirms no
  // listEntityFieldTranslations/resolveEntityFieldValue call for entityType "AuditLog") and
  // never shown to a user. Since createAuditLog runs on essentially every create/update/delete
  // across the app, that made LibreTranslate a silent hard dependency of nearly all writes for
  // zero benefit. Removed - see git history if this needs to come back for a real reason.

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
                  fullName: { contains: query.actor },
                },
              },
            },
            {
              actorUser: {
                is: {
                  email: { contains: query.actor },
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
