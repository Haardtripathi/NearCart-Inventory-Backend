"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuditLog = createAuditLog;
exports.listAuditLogs = listAuditLogs;
const prisma_1 = require("../../config/prisma");
const pagination_1 = require("../../utils/pagination");
const json_1 = require("../../utils/json");
async function createAuditLog(db, input) {
    return db.auditLog.create({
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
}
async function listAuditLogs(organizationId, query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        ...(query.action ? { action: query.action } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
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
