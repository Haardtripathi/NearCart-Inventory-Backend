"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTaxRates = listTaxRates;
exports.createTaxRate = createTaxRate;
exports.updateTaxRate = updateTaxRate;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const decimal_1 = require("../../utils/decimal");
const ApiError_1 = require("../../utils/ApiError");
const entityFieldTranslations_1 = require("../../utils/entityFieldTranslations");
const localization_1 = require("../../utils/localization");
const pagination_1 = require("../../utils/pagination");
const audit_service_1 = require("../audit/audit.service");
function serializeTaxRate(taxRate, localeContext, translations = []) {
    return {
        ...(0, localization_1.serializeLocalizedEntity)(taxRate, localeContext),
        displayName: (0, entityFieldTranslations_1.resolveEntityFieldValue)(taxRate.name, translations, "name", localeContext) ?? taxRate.name,
    };
}
async function listTaxRates(organizationId, query, localeContext) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.search
            ? {
                OR: [
                    { name: { contains: query.search, mode: "insensitive" } },
                    { code: { contains: query.search, mode: "insensitive" } },
                ],
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.taxRate.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma_1.prisma.taxRate.count({ where }),
    ]);
    const translations = await (0, entityFieldTranslations_1.listEntityFieldTranslations)("TaxRate", items.map((taxRate) => taxRate.id), ["name"]);
    const translationsByEntityId = new Map();
    for (const translation of translations) {
        const bucket = translationsByEntityId.get(translation.entityId) ?? [];
        bucket.push(translation);
        translationsByEntityId.set(translation.entityId, bucket);
    }
    return {
        items: items.map((taxRate) => serializeTaxRate(taxRate, localeContext, translationsByEntityId.get(taxRate.id) ?? [])),
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createTaxRate(organizationId, actorUserId, input, localeContext) {
    const taxRate = await prisma_1.prisma.taxRate.create({
        data: {
            organizationId,
            name: input.name.trim(),
            code: input.code ?? null,
            rate: (0, decimal_1.toDecimal)(input.rate),
            isInclusive: input.isInclusive ?? false,
            isActive: input.isActive ?? true,
        },
    });
    await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(prisma_1.prisma, {
        organizationId,
        entityType: "TaxRate",
        entityId: taxRate.id,
        fields: [{ fieldKey: "name", value: input.name }],
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "TaxRate",
        entityId: taxRate.id,
        after: taxRate,
    });
    return serializeTaxRate(taxRate, localeContext);
}
async function updateTaxRate(organizationId, taxRateId, actorUserId, input, localeContext) {
    const existing = await prisma_1.prisma.taxRate.findFirst({
        where: {
            id: taxRateId,
            organizationId,
        },
    });
    if (!existing) {
        throw ApiError_1.ApiError.notFound("Tax rate not found");
    }
    const updated = await prisma_1.prisma.taxRate.update({
        where: { id: taxRateId },
        data: {
            ...(input.name ? { name: input.name.trim() } : {}),
            ...(input.code !== undefined ? { code: input.code || null } : {}),
            ...(input.rate !== undefined ? { rate: (0, decimal_1.toDecimal)(input.rate) } : {}),
            ...(input.isInclusive !== undefined ? { isInclusive: input.isInclusive } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
    });
    await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(prisma_1.prisma, {
        organizationId,
        entityType: "TaxRate",
        entityId: updated.id,
        fields: [{ fieldKey: "name", value: input.name ?? updated.name }],
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "TaxRate",
        entityId: updated.id,
        before: existing,
        after: updated,
    });
    return serializeTaxRate(updated, localeContext);
}
