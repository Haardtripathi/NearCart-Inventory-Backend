"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUnits = listUnits;
exports.createUnit = createUnit;
exports.getUnitById = getUnitById;
exports.updateUnit = updateUnit;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const localization_1 = require("../../utils/localization");
const pagination_1 = require("../../utils/pagination");
const translations_1 = require("../../utils/translations");
const autoTranslate_1 = require("../../utils/autoTranslate");
const audit_service_1 = require("../audit/audit.service");
function serializeUnit(unit, localeContext) {
    return (0, localization_1.serializeLocalizedEntity)(unit, localeContext);
}
async function getUnitRecordById(organizationId, unitId) {
    const unit = await prisma_1.prisma.unit.findFirst({
        where: {
            id: unitId,
            OR: [
                { organizationId },
                { organizationId: null, isSystem: true },
            ],
        },
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
    });
    if (!unit) {
        throw ApiError_1.ApiError.notFound("Unit not found");
    }
    return unit;
}
async function listUnits(organizationId, query, localeContext) {
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
                            {
                                translations: {
                                    some: {
                                        name: { contains: query.search, mode: "insensitive" },
                                    },
                                },
                            },
                        ],
                    },
                ],
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.unit.findMany({
            where,
            include: {
                translations: {
                    orderBy: {
                        language: "asc",
                    },
                },
            },
            orderBy: [{ isSystem: "desc" }, { name: "asc" }],
            skip,
            take: limit,
        }),
        prisma_1.prisma.unit.count({ where }),
    ]);
    return {
        items: items.map((item) => serializeUnit(item, localeContext)),
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createUnit(organizationId, actorUserId, input, localeContext) {
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
    const translations = await (0, autoTranslate_1.enrichWithAutoTranslations)({
        organizationId,
        baseName: input.name,
        existingTranslations: input.translations,
    });
    const unit = await prisma_1.prisma.$transaction(async (tx) => {
        const created = await tx.unit.create({
            data: {
                organizationId,
                code: input.code.trim().toLowerCase(),
                name: input.name.trim(),
                symbol: input.symbol ?? null,
                allowsDecimal: input.allowsDecimal ?? true,
                isSystem: false,
            },
        });
        if (translations.length) {
            await tx.unitTranslation.createMany({
                data: translations.map((translation) => ({
                    unitId: created.id,
                    language: translation.language,
                    name: translation.name.trim(),
                })),
            });
        }
        return created;
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "Unit",
        entityId: unit.id,
        after: unit,
    });
    return serializeUnit(await getUnitRecordById(organizationId, unit.id), localeContext);
}
async function getUnitById(organizationId, unitId, localeContext) {
    return serializeUnit(await getUnitRecordById(organizationId, unitId), localeContext);
}
async function updateUnit(organizationId, unitId, actorUserId, input, localeContext) {
    const existing = await getUnitRecordById(organizationId, unitId);
    const translations = await (0, autoTranslate_1.enrichWithAutoTranslations)({
        organizationId: existing.organizationId ?? organizationId,
        baseName: input.name ?? existing.name,
        existingTranslations: input.translations ??
            existing.translations.map((translation) => ({
                language: translation.language,
                name: translation.name,
            })),
    });
    await prisma_1.prisma.$transaction(async (tx) => {
        if (!existing.isSystem) {
            await tx.unit.update({
                where: { id: unitId },
                data: {
                    ...(input.code ? { code: input.code.trim().toLowerCase() } : {}),
                    ...(input.name ? { name: input.name.trim() } : {}),
                    ...(input.symbol !== undefined ? { symbol: input.symbol || null } : {}),
                    ...(input.allowsDecimal !== undefined ? { allowsDecimal: input.allowsDecimal } : {}),
                },
            });
        }
        await (0, translations_1.upsertTranslations)({
            entries: translations,
            listExisting: () => tx.unitTranslation.findMany({
                where: {
                    unitId,
                },
                select: {
                    id: true,
                    language: true,
                },
            }),
            create: (translation) => tx.unitTranslation.create({
                data: {
                    unitId,
                    language: translation.language,
                    name: translation.name.trim(),
                },
            }),
            update: (current, translation) => tx.unitTranslation.update({
                where: { id: current.id },
                data: {
                    name: translation.name.trim(),
                },
            }),
        });
    });
    const updated = await getUnitRecordById(organizationId, unitId);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "Unit",
        entityId: unitId,
        before: existing,
        after: updated,
    });
    return serializeUnit(updated, localeContext);
}
