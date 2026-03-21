"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSuppliers = listSuppliers;
exports.createSupplier = createSupplier;
exports.getSupplierById = getSupplierById;
exports.updateSupplier = updateSupplier;
exports.deleteSupplier = deleteSupplier;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const json_1 = require("../../utils/json");
const localization_1 = require("../../utils/localization");
const pagination_1 = require("../../utils/pagination");
const translations_1 = require("../../utils/translations");
const autoTranslate_1 = require("../../utils/autoTranslate");
const audit_service_1 = require("../audit/audit.service");
function serializeSupplier(supplier, localeContext) {
    return (0, localization_1.serializeLocalizedEntity)(supplier, localeContext);
}
async function getSupplierRecordById(organizationId, supplierId) {
    const supplier = await prisma_1.prisma.supplier.findFirst({
        where: {
            id: supplierId,
            organizationId,
            deletedAt: null,
        },
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
    });
    if (!supplier) {
        throw ApiError_1.ApiError.notFound("Supplier not found");
    }
    return supplier;
}
async function listSuppliers(organizationId, query, localeContext) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        deletedAt: null,
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.search
            ? {
                OR: [
                    { name: { contains: query.search, mode: "insensitive" } },
                    { code: { contains: query.search, mode: "insensitive" } },
                    { phone: { contains: query.search, mode: "insensitive" } },
                    { email: { contains: query.search, mode: "insensitive" } },
                    {
                        translations: {
                            some: {
                                name: { contains: query.search, mode: "insensitive" },
                            },
                        },
                    },
                ],
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.supplier.findMany({
            where,
            include: {
                translations: {
                    orderBy: {
                        language: "asc",
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma_1.prisma.supplier.count({ where }),
    ]);
    return {
        items: items.map((item) => serializeSupplier(item, localeContext)),
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createSupplier(organizationId, actorUserId, input, localeContext) {
    const translations = await (0, autoTranslate_1.enrichWithAutoTranslations)({
        organizationId,
        baseName: input.name,
        existingTranslations: input.translations,
    });
    const supplier = await prisma_1.prisma.$transaction(async (tx) => {
        const created = await tx.supplier.create({
            data: {
                organizationId,
                name: input.name.trim(),
                code: input.code ?? null,
                phone: input.phone ?? null,
                email: input.email ?? null,
                taxNumber: input.taxNumber ?? null,
                address: (0, json_1.toNullableJsonValue)(input.address),
                notes: input.notes ?? null,
                isActive: input.isActive ?? true,
            },
        });
        if (translations.length) {
            await tx.supplierTranslation.createMany({
                data: translations.map((translation) => ({
                    supplierId: created.id,
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
        entityType: "Supplier",
        entityId: supplier.id,
        after: supplier,
    });
    return serializeSupplier(await getSupplierRecordById(organizationId, supplier.id), localeContext);
}
async function getSupplierById(organizationId, supplierId, localeContext) {
    return serializeSupplier(await getSupplierRecordById(organizationId, supplierId), localeContext);
}
async function updateSupplier(organizationId, supplierId, actorUserId, input, localeContext) {
    const existing = await getSupplierRecordById(organizationId, supplierId);
    const translations = await (0, autoTranslate_1.enrichWithAutoTranslations)({
        organizationId,
        baseName: input.name ?? existing.name,
        existingTranslations: input.translations ??
            existing.translations.map((translation) => ({
                language: translation.language,
                name: translation.name,
            })),
    });
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        const nextSupplier = await tx.supplier.update({
            where: { id: supplierId },
            data: {
                ...(input.name ? { name: input.name.trim() } : {}),
                ...(input.code !== undefined ? { code: input.code || null } : {}),
                ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
                ...(input.email !== undefined ? { email: input.email || null } : {}),
                ...(input.taxNumber !== undefined ? { taxNumber: input.taxNumber || null } : {}),
                ...(input.address !== undefined ? { address: (0, json_1.toNullableJsonValue)(input.address) } : {}),
                ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
                ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
            },
        });
        await (0, translations_1.upsertTranslations)({
            entries: translations,
            listExisting: () => tx.supplierTranslation.findMany({
                where: {
                    supplierId,
                },
                select: {
                    id: true,
                    language: true,
                },
            }),
            create: (translation) => tx.supplierTranslation.create({
                data: {
                    supplierId,
                    language: translation.language,
                    name: translation.name.trim(),
                },
            }),
            update: (current, translation) => tx.supplierTranslation.update({
                where: { id: current.id },
                data: {
                    name: translation.name.trim(),
                },
            }),
        });
        return nextSupplier;
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "Supplier",
        entityId: updated.id,
        before: existing,
        after: updated,
    });
    return serializeSupplier(await getSupplierRecordById(organizationId, updated.id), localeContext);
}
async function deleteSupplier(organizationId, supplierId, actorUserId) {
    const existing = await getSupplierRecordById(organizationId, supplierId);
    const deleted = await prisma_1.prisma.supplier.update({
        where: { id: supplierId },
        data: {
            isActive: false,
            deletedAt: new Date(),
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.DELETE,
        entityType: "Supplier",
        entityId: deleted.id,
        before: existing,
        after: deleted,
    });
    return deleted;
}
