"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuditLog = createAuditLog;
exports.listAuditLogs = listAuditLogs;
const prisma_1 = require("../../config/prisma");
const entityFieldTranslations_1 = require("../../utils/entityFieldTranslations");
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
    try {
        await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(db, {
            organizationId: input.organizationId ?? undefined,
            entityType: "AuditLog",
            entityId: auditLog.id,
            fields: [{ fieldKey: "entityType", value: input.entityType }],
        });
    }
    catch (error) {
        // Audit-log creation is primary; translation sync must never block auth or writes.
        console.warn("Audit translation sync failed", {
            auditLogId: auditLog.id,
            entityType: input.entityType,
            error,
        });
    }
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
                                fullName: { contains: query.actor, mode: "insensitive" },
                            },
                        },
                    },
                    {
                        actorUser: {
                            is: {
                                email: { contains: query.actor, mode: "insensitive" },
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
