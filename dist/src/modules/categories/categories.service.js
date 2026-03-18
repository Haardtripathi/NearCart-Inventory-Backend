"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCategories = listCategories;
exports.getCategoryTree = getCategoryTree;
exports.createCategory = createCategory;
exports.getCategoryById = getCategoryById;
exports.updateCategory = updateCategory;
exports.deleteCategory = deleteCategory;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const localization_1 = require("../../utils/localization");
const pagination_1 = require("../../utils/pagination");
const slug_1 = require("../../utils/slug");
const guards_1 = require("../../utils/guards");
const json_1 = require("../../utils/json");
const translations_1 = require("../../utils/translations");
const audit_service_1 = require("../audit/audit.service");
function serializeCategory(category, localeContext) {
    const localizedCategory = (0, localization_1.serializeLocalizedEntity)(category, localeContext);
    return {
        ...localizedCategory,
        parent: category.parent ? (0, localization_1.serializeLocalizedEntity)(category.parent, localeContext) : null,
        children: category.children.map((child) => (0, localization_1.serializeLocalizedEntity)(child, localeContext)),
    };
}
async function getCategoryRecordById(organizationId, categoryId) {
    const category = await prisma_1.prisma.category.findFirst({
        where: {
            id: categoryId,
            organizationId,
            deletedAt: null,
        },
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
            parent: {
                include: {
                    translations: {
                        orderBy: {
                            language: "asc",
                        },
                    },
                },
            },
            children: {
                where: {
                    deletedAt: null,
                },
                include: {
                    translations: {
                        orderBy: {
                            language: "asc",
                        },
                    },
                },
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            },
        },
    });
    if (!category) {
        throw ApiError_1.ApiError.notFound("Category not found");
    }
    return category;
}
async function assertNoCircularParent(organizationId, categoryId, parentId) {
    let currentParentId = parentId;
    while (currentParentId) {
        if (currentParentId === categoryId) {
            throw ApiError_1.ApiError.badRequest("Category circular parent relation is not allowed");
        }
        const parentCategory = await prisma_1.prisma.category.findFirst({
            where: {
                id: currentParentId,
                organizationId,
                deletedAt: null,
            },
            select: {
                parentId: true,
            },
        });
        currentParentId = parentCategory?.parentId ?? null;
    }
}
async function listCategories(organizationId, query, localeContext) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        deletedAt: null,
        ...(query.parentId ? { parentId: query.parentId } : {}),
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
        prisma_1.prisma.category.findMany({
            where,
            include: {
                translations: {
                    orderBy: {
                        language: "asc",
                    },
                },
                parent: {
                    include: {
                        translations: {
                            orderBy: {
                                language: "asc",
                            },
                        },
                    },
                },
                children: {
                    where: {
                        deletedAt: null,
                    },
                    include: {
                        translations: {
                            orderBy: {
                                language: "asc",
                            },
                        },
                    },
                    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                },
            },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            skip,
            take: limit,
        }),
        prisma_1.prisma.category.count({ where }),
    ]);
    return {
        items: items.map((category) => serializeCategory(category, localeContext)),
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function getCategoryTree(organizationId, localeContext) {
    const categories = await prisma_1.prisma.category.findMany({
        where: {
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
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const map = new Map(categories.map((category) => [
        category.id,
        {
            ...(0, localization_1.serializeLocalizedEntity)(category, localeContext),
            children: [],
        },
    ]));
    const roots = [];
    for (const category of categories) {
        const current = map.get(category.id);
        if (category.parentId && map.has(category.parentId)) {
            map.get(category.parentId).children.push(current);
        }
        else {
            roots.push(current);
        }
    }
    return roots;
}
async function createCategory(organizationId, actorUserId, input, localeContext) {
    if (input.parentId) {
        await (0, guards_1.assertCategoryInOrg)(prisma_1.prisma, organizationId, input.parentId);
    }
    const category = await prisma_1.prisma.$transaction(async (tx) => {
        const created = await tx.category.create({
            data: {
                organizationId,
                parentId: input.parentId ?? null,
                name: input.name.trim(),
                slug: (0, slug_1.slugify)(input.slug ?? input.name),
                description: input.description ?? null,
                isActive: input.isActive ?? true,
                sortOrder: input.sortOrder ?? 0,
                customFields: (0, json_1.toNullableJsonValue)(input.customFields),
            },
        });
        if (input.translations?.length) {
            await tx.categoryTranslation.createMany({
                data: input.translations.map((translation) => ({
                    categoryId: created.id,
                    language: translation.language,
                    name: translation.name.trim(),
                    description: translation.description?.trim() ?? null,
                })),
            });
        }
        return created;
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "Category",
        entityId: category.id,
        after: category,
    });
    return serializeCategory(await getCategoryRecordById(organizationId, category.id), localeContext);
}
async function getCategoryById(organizationId, categoryId, localeContext) {
    return serializeCategory(await getCategoryRecordById(organizationId, categoryId), localeContext);
}
async function updateCategory(organizationId, categoryId, actorUserId, input, localeContext) {
    const existing = await getCategoryRecordById(organizationId, categoryId);
    if (input.parentId !== undefined) {
        if (input.parentId === categoryId) {
            throw ApiError_1.ApiError.badRequest("Category cannot be its own parent");
        }
        if (input.parentId) {
            await (0, guards_1.assertCategoryInOrg)(prisma_1.prisma, organizationId, input.parentId);
            await assertNoCircularParent(organizationId, categoryId, input.parentId);
        }
    }
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.category.update({
            where: { id: categoryId },
            data: {
                ...(input.parentId !== undefined
                    ? input.parentId
                        ? { parent: { connect: { id: input.parentId } } }
                        : { parent: { disconnect: true } }
                    : {}),
                ...(input.name ? { name: input.name.trim() } : {}),
                ...(input.slug ? { slug: (0, slug_1.slugify)(input.slug) } : {}),
                ...(input.description !== undefined ? { description: input.description || null } : {}),
                ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
                ...(input.customFields !== undefined ? { customFields: (0, json_1.toNullableJsonValue)(input.customFields) } : {}),
            },
        });
        await (0, translations_1.upsertTranslations)({
            entries: input.translations ?? [],
            listExisting: () => tx.categoryTranslation.findMany({
                where: {
                    categoryId,
                },
                select: {
                    id: true,
                    language: true,
                },
            }),
            create: (translation) => tx.categoryTranslation.create({
                data: {
                    categoryId,
                    language: translation.language,
                    name: translation.name.trim(),
                    description: translation.description?.trim() ?? null,
                },
            }),
            update: (existingTranslation, translation) => tx.categoryTranslation.update({
                where: {
                    id: existingTranslation.id,
                },
                data: {
                    name: translation.name.trim(),
                    description: translation.description?.trim() ?? null,
                },
            }),
        });
    });
    const updated = await getCategoryRecordById(organizationId, categoryId);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "Category",
        entityId: updated.id,
        before: existing,
        after: updated,
    });
    return serializeCategory(updated, localeContext);
}
async function deleteCategory(organizationId, categoryId, actorUserId) {
    const category = await getCategoryRecordById(organizationId, categoryId);
    const [activeChildrenCount, linkedProductsCount] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.category.count({
            where: {
                organizationId,
                parentId: categoryId,
                deletedAt: null,
                isActive: true,
            },
        }),
        prisma_1.prisma.product.count({
            where: {
                organizationId,
                categoryId,
                deletedAt: null,
            },
        }),
    ]);
    if (activeChildrenCount > 0) {
        throw ApiError_1.ApiError.conflict("Cannot delete category with active child categories");
    }
    if (linkedProductsCount > 0) {
        throw ApiError_1.ApiError.conflict("Cannot delete category with linked products");
    }
    const deleted = await prisma_1.prisma.category.update({
        where: { id: categoryId },
        data: {
            isActive: false,
            deletedAt: new Date(),
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.DELETE,
        entityType: "Category",
        entityId: deleted.id,
        before: category,
        after: deleted,
    });
    return deleted;
}
