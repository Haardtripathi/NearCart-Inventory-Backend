"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBrands = listBrands;
exports.createBrand = createBrand;
exports.getBrandById = getBrandById;
exports.updateBrand = updateBrand;
exports.deleteBrand = deleteBrand;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const localization_1 = require("../../utils/localization");
const pagination_1 = require("../../utils/pagination");
const slug_1 = require("../../utils/slug");
const translations_1 = require("../../utils/translations");
const autoTranslate_1 = require("../../utils/autoTranslate");
const audit_service_1 = require("../audit/audit.service");
function serializeBrand(brand, localeContext) {
    return (0, localization_1.serializeLocalizedEntity)(brand, localeContext);
}
async function getBrandRecordById(organizationId, brandId) {
    const brand = await prisma_1.prisma.brand.findFirst({
        where: {
            id: brandId,
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
    if (!brand) {
        throw ApiError_1.ApiError.notFound("Brand not found");
    }
    return brand;
}
async function listBrands(organizationId, query, localeContext) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        deletedAt: null,
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.search
            ? {
                OR: [
                    { name: { contains: query.search, mode: "insensitive" } },
                    { slug: { contains: query.search, mode: "insensitive" } },
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
        prisma_1.prisma.brand.findMany({
            where,
            include: {
                translations: {
                    orderBy: {
                        language: "asc",
                    },
                },
            },
            orderBy: { name: "asc" },
            skip,
            take: limit,
        }),
        prisma_1.prisma.brand.count({ where }),
    ]);
    const serializedItems = items.map((item) => serializeBrand(item, localeContext));
    return {
        items: serializedItems,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createBrand(organizationId, actorUserId, input, localeContext) {
    const translations = await (0, autoTranslate_1.enrichWithAutoTranslations)({
        organizationId,
        baseName: input.name,
        existingTranslations: input.translations,
    });
    const brand = await prisma_1.prisma.$transaction(async (tx) => {
        const created = await tx.brand.create({
            data: {
                organizationId,
                name: input.name.trim(),
                slug: (0, slug_1.slugify)(input.slug ?? input.name),
                isActive: input.isActive ?? true,
            },
        });
        if (translations.length) {
            await tx.brandTranslation.createMany({
                data: translations.map((translation) => ({
                    brandId: created.id,
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
        entityType: "Brand",
        entityId: brand.id,
        after: brand,
    });
    return serializeBrand(await getBrandRecordById(organizationId, brand.id), localeContext);
}
async function getBrandById(organizationId, brandId, localeContext) {
    return serializeBrand(await getBrandRecordById(organizationId, brandId), localeContext);
}
async function updateBrand(organizationId, brandId, actorUserId, input, localeContext) {
    const existing = await getBrandRecordById(organizationId, brandId);
    const translations = await (0, autoTranslate_1.enrichWithAutoTranslations)({
        organizationId,
        baseName: input.name ?? existing.name,
        existingTranslations: input.translations ??
            existing.translations.map((translation) => ({
                language: translation.language,
                name: translation.name,
            })),
    });
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.brand.update({
            where: { id: brandId },
            data: {
                ...(input.name ? { name: input.name.trim() } : {}),
                ...(input.slug ? { slug: (0, slug_1.slugify)(input.slug) } : {}),
                ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
            },
        });
        await (0, translations_1.upsertTranslations)({
            entries: translations,
            listExisting: () => tx.brandTranslation.findMany({
                where: {
                    brandId,
                },
            }),
            create: (entry) => tx.brandTranslation.create({
                data: {
                    brandId,
                    language: entry.language,
                    name: entry.name.trim(),
                },
            }),
            update: (existing, entry) => tx.brandTranslation.update({
                where: { id: existing.id },
                data: {
                    name: entry.name.trim(),
                },
            }),
        });
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "Brand",
        entityId: brandId,
        before: existing,
        after: await getBrandRecordById(organizationId, brandId),
    });
    return serializeBrand(await getBrandRecordById(organizationId, brandId), localeContext);
}
async function deleteBrand(organizationId, brandId, actorUserId) {
    const existing = await getBrandRecordById(organizationId, brandId);
    const deleted = await prisma_1.prisma.brand.update({
        where: { id: brandId },
        data: {
            isActive: false,
            deletedAt: new Date(),
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.DELETE,
        entityType: "Brand",
        entityId: deleted.id,
        before: existing,
        after: deleted,
    });
    return deleted;
}
