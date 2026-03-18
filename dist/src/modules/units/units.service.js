"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUnits = listUnits;
exports.createUnit = createUnit;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const pagination_1 = require("../../utils/pagination");
const audit_service_1 = require("../audit/audit.service");
async function listUnits(organizationId, query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
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
                            { name: { contains: query.search, mode: "insensitive" } },
                            { code: { contains: query.search, mode: "insensitive" } },
                            { symbol: { contains: query.search, mode: "insensitive" } },
                        ],
                    },
                ],
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.unit.findMany({
            where,
            orderBy: [{ isSystem: "desc" }, { name: "asc" }],
            skip,
            take: limit,
        }),
        prisma_1.prisma.unit.count({ where }),
    ]);
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createUnit(organizationId, actorUserId, input) {
    const existing = await prisma_1.prisma.unit.findFirst({
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
        throw ApiError_1.ApiError.conflict("Unit code already exists in this organization or as a system unit");
    }
    const unit = await prisma_1.prisma.unit.create({
        data: {
            organizationId,
            code: input.code.trim().toLowerCase(),
            name: input.name.trim(),
            symbol: input.symbol ?? null,
            allowsDecimal: input.allowsDecimal ?? true,
            isSystem: false,
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "Unit",
        entityId: unit.id,
        after: unit,
    });
    return unit;
}
