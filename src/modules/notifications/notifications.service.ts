import { NotificationLogType } from "@prisma/client";

import { prisma } from "../../config/prisma";
import type { DbClient } from "../../types/prisma";
import { ApiError } from "../../utils/ApiError";
import { toNullableJsonValue } from "../../utils/json";
import { buildPagination, getPagination } from "../../utils/pagination";

interface RecordNotificationInput {
  organizationId: string;
  type: NotificationLogType;
  title: string;
  body: string;
  data?: unknown;
}

/**
 * Persists the same shop-staff alert already being pushed via sendPushToOrgStaff — see the
 * NotificationLog model comment in schema.prisma. Called alongside (never instead of) the actual
 * push at both existing org-staff push call sites. Deliberately takes `db: DbClient` (not the
 * bare `prisma` singleton) so it can be called from inside the same transaction the caller is
 * already in (e.g. inventory.service.ts's applyStockMovement) without a second connection — but
 * unlike the push itself, a caller does NOT need to fire-and-forget/try-catch this: a failure
 * here should be rare (a straightforward insert) and, if it does throw, callers should decide for
 * themselves whether that failure should roll back the movement it's describing.
 */
export async function recordNotificationLog(db: DbClient, input: RecordNotificationInput) {
  return db.notificationLog.create({
    data: {
      organizationId: input.organizationId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: toNullableJsonValue(input.data),
    },
  });
}

export async function listNotificationLogs(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    unreadOnly?: boolean;
    type?: NotificationLogType;
  },
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    ...(query.unreadOnly ? { readAt: null } : {}),
    ...(query.type ? { type: query.type } : {}),
  };

  const [items, totalItems, unreadCount] = await prisma.$transaction([
    prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.notificationLog.count({ where }),
    prisma.notificationLog.count({ where: { organizationId, readAt: null } }),
  ]);

  return {
    items,
    pagination: buildPagination(page, limit, totalItems),
    unreadCount,
  };
}

export async function markNotificationRead(organizationId: string, id: string) {
  const existing = await prisma.notificationLog.findFirst({ where: { id, organizationId } });

  if (!existing) {
    throw ApiError.notFound("Notification not found");
  }

  if (existing.readAt) {
    return existing;
  }

  return prisma.notificationLog.update({
    where: { id },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(organizationId: string) {
  const result = await prisma.notificationLog.updateMany({
    where: { organizationId, readAt: null },
    data: { readAt: new Date() },
  });

  return { updatedCount: result.count };
}
