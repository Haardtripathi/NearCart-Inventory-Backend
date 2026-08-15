"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordNotificationLog = recordNotificationLog;
exports.listNotificationLogs = listNotificationLogs;
exports.markNotificationRead = markNotificationRead;
exports.markAllNotificationsRead = markAllNotificationsRead;
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const json_1 = require("../../utils/json");
const pagination_1 = require("../../utils/pagination");
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
async function recordNotificationLog(db, input) {
    return db.notificationLog.create({
        data: {
            organizationId: input.organizationId,
            type: input.type,
            title: input.title,
            body: input.body,
            data: (0, json_1.toNullableJsonValue)(input.data),
        },
    });
}
async function listNotificationLogs(organizationId, query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        ...(query.unreadOnly ? { readAt: null } : {}),
        ...(query.type ? { type: query.type } : {}),
    };
    const [items, totalItems, unreadCount] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.notificationLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma_1.prisma.notificationLog.count({ where }),
        prisma_1.prisma.notificationLog.count({ where: { organizationId, readAt: null } }),
    ]);
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
        unreadCount,
    };
}
async function markNotificationRead(organizationId, id) {
    const existing = await prisma_1.prisma.notificationLog.findFirst({ where: { id, organizationId } });
    if (!existing) {
        throw ApiError_1.ApiError.notFound("Notification not found");
    }
    if (existing.readAt) {
        return existing;
    }
    return prisma_1.prisma.notificationLog.update({
        where: { id },
        data: { readAt: new Date() },
    });
}
async function markAllNotificationsRead(organizationId) {
    const result = await prisma_1.prisma.notificationLog.updateMany({
        where: { organizationId, readAt: null },
        data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
}
