"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuditLog = createAuditLog;
exports.listAuditLogs = listAuditLogs;
const prisma_1 = require("../../config/prisma");
const pagination_1 = require("../../utils/pagination");
const json_1 = require("../../utils/json");
async function createAuditLog(db, input) {
    const auditLog = await db.auditLog.create({
        data: {
            organizationId: input.organizationId ?? null,
            actorUserId: input.actorUserId ?? null,
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId ?? null,
            before: (0, json_1.toNullableJsonValue)(input.before),
            after: (0, json_1.toNullableJsonValue)(input.after),
            meta: (0, json_1.toNullableJsonValue)(input.meta),
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
async function listAuditLogs(organizationId, query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
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
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.auditLog.findMany({
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
        prisma_1.prisma.auditLog.count({ where }),
    ]);
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
