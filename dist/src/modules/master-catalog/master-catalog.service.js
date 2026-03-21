"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeMasterCatalogCategory = serializeMasterCatalogCategory;
exports.serializeMasterCatalogItem = serializeMasterCatalogItem;
exports.getMasterCatalogCategories = getMasterCatalogCategories;
exports.getMasterCatalogCategoryTree = getMasterCatalogCategoryTree;
exports.createMasterCatalogCategory = createMasterCatalogCategory;
exports.updateMasterCatalogCategory = updateMasterCatalogCategory;
exports.getMasterCatalogItems = getMasterCatalogItems;
exports.getMasterCatalogItemById = getMasterCatalogItemById;
exports.createMasterCatalogItem = createMasterCatalogItem;
exports.updateMasterCatalogItem = updateMasterCatalogItem;
exports.getFeaturedMasterCatalogItems = getFeaturedMasterCatalogItems;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const decimal_1 = require("../../utils/decimal");
const localization_1 = require("../../utils/localization");
const masterCatalog_1 = require("../../utils/masterCatalog");
const pagination_1 = require("../../utils/pagination");
const slug_1 = require("../../utils/slug");
const translations_1 = require("../../utils/translations");
const json_1 = require("../../utils/json");
const autoTranslate_1 = require("../../utils/autoTranslate");
const audit_service_1 = require("../audit/audit.service");
const masterCatalogCategoryInclude = {
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
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    },
};
const masterCatalogItemInclude = {
    translations: {
        orderBy: {
            language: "asc",
        },
    },
    aliases: {
        orderBy: [{ language: "asc" }, { value: "asc" }],
    },
    category: {
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
    },
    variantTemplates: {
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    },
    importedProducts: {
        where: {
            deletedAt: null,
        },
        select: {
            id: true,
            organizationId: true,
        },
    },
};
function getMasterCategoryCanonicalFields(category) {
    const englishTranslation = category.translations.find((translation) => translation.language === client_1.LanguageCode.EN);
    const fallbackTranslation = englishTranslation ?? category.translations[0];
    return {
        name: fallbackTranslation?.name ?? category.code,
        description: fallbackTranslation?.description ?? null,
    };
}
function serializeMasterCatalogCategory(category, localeContext) {
    const canonicalFields = getMasterCategoryCanonicalFields(category);
    const localized = (0, localization_1.serializeLocalizedEntity)({
        ...category,
        name: canonicalFields.name,
        description: canonicalFields.description,
    }, localeContext);
    return {
        ...localized,
        parent: "parent" in category && category.parent
            ? (0, localization_1.serializeLocalizedEntity)({
                ...category.parent,
                ...getMasterCategoryCanonicalFields(category.parent),
            }, localeContext)
            : null,
        children: "children" in category && Array.isArray(category.children)
            ? category.children.map((child) => serializeMasterCatalogCategory(child, localeContext))
            : [],
    };
}
function serializeMasterCatalogVariantTemplate(variantTemplate, localeContext) {
    return (0, localization_1.serializeLocalizedEntity)(variantTemplate, localeContext);
}
function serializeMasterCatalogItem(item, localeContext, options) {
    const localized = (0, localization_1.serializeLocalizedEntity)({
        ...item,
        name: item.canonicalName,
        description: item.canonicalDescription,
    }, localeContext, {
        getName: (translation) => translation.name,
        getDescription: (translation) => translation.description,
    });
    const alreadyImportedProductId = options?.currentOrganizationId
        ? item.importedProducts.find((product) => product.organizationId === options.currentOrganizationId)?.id ?? null
        : null;
    const importable = Boolean(options?.currentOrganizationId) &&
        item.isActive &&
        Boolean(options?.organizationIndustryIds?.has(item.industryId));
    return {
        ...localized,
        category: item.category ? serializeMasterCatalogCategory(item.category, localeContext) : null,
        variantTemplates: item.variantTemplates.map((variantTemplate) => serializeMasterCatalogVariantTemplate(variantTemplate, localeContext)),
        alreadyImportedProductId,
        importable,
    };
}
async function getOrganizationIndustryIds(organizationId) {
    if (!organizationId) {
        return new Set();
    }
    const configs = await prisma_1.prisma.organizationIndustryConfig.findMany({
        where: {
            organizationId,
        },
        select: {
            industryId: true,
        },
    });
    return new Set(configs.map((config) => config.industryId));
}
async function getMasterCatalogCategoryRecordById(categoryId) {
    const category = await prisma_1.prisma.masterCatalogCategory.findUnique({
        where: {
            id: categoryId,
        },
        include: masterCatalogCategoryInclude,
    });
    if (!category) {
        throw ApiError_1.ApiError.notFound("Master catalog category not found");
    }
    return category;
}
async function getMasterCatalogItemRecordById(itemId) {
    const item = await prisma_1.prisma.masterCatalogItem.findUnique({
        where: {
            id: itemId,
        },
        include: masterCatalogItemInclude,
    });
    if (!item) {
        throw ApiError_1.ApiError.notFound("Master catalog item not found");
    }
    return item;
}
async function rebuildMasterItemSearchText(db, masterItemId) {
    const item = await db.masterCatalogItem.findUniqueOrThrow({
        where: {
            id: masterItemId,
        },
        include: {
            translations: true,
            aliases: true,
        },
    });
    const searchText = (0, masterCatalog_1.buildMasterItemSearchText)({
        canonicalName: item.canonicalName,
        code: item.code,
        slug: item.slug,
        translations: item.translations,
        aliases: item.aliases,
    });
    await db.masterCatalogItem.update({
        where: {
            id: masterItemId,
        },
        data: {
            searchText,
        },
    });
}
async function upsertMasterCategoryTranslations(db, masterCategoryId, translations) {
    await (0, translations_1.upsertTranslations)({
        entries: translations,
        listExisting: () => db.masterCatalogCategoryTranslation.findMany({
            where: {
                masterCategoryId,
            },
            select: {
                id: true,
                language: true,
            },
        }),
        create: (translation) => db.masterCatalogCategoryTranslation.create({
            data: {
                masterCategoryId,
                language: translation.language,
                name: translation.name.trim(),
                description: translation.description?.trim() ?? null,
            },
        }),
        update: (existing, translation) => db.masterCatalogCategoryTranslation.update({
            where: {
                id: existing.id,
            },
            data: {
                name: translation.name.trim(),
                description: translation.description?.trim() ?? null,
            },
        }),
    });
}
async function upsertMasterItemTranslations(db, masterItemId, translations) {
    await (0, translations_1.upsertTranslations)({
        entries: translations,
        listExisting: () => db.masterCatalogItemTranslation.findMany({
            where: {
                masterItemId,
            },
            select: {
                id: true,
                language: true,
            },
        }),
        create: (translation) => db.masterCatalogItemTranslation.create({
            data: {
                masterItemId,
                language: translation.language,
                name: translation.name.trim(),
                shortName: translation.shortName?.trim() ?? null,
                description: translation.description?.trim() ?? null,
            },
        }),
        update: (existing, translation) => db.masterCatalogItemTranslation.update({
            where: {
                id: existing.id,
            },
            data: {
                name: translation.name.trim(),
                shortName: translation.shortName?.trim() ?? null,
                description: translation.description?.trim() ?? null,
            },
        }),
    });
}
async function replaceMasterItemAliases(db, masterItemId, aliases) {
    const normalizedAliases = (0, masterCatalog_1.normalizeMasterCatalogAliasValues)(aliases.map((alias) => ({
        language: alias.language,
        value: alias.value.trim(),
    })));
    await db.masterCatalogItemAlias.deleteMany({
        where: {
            masterItemId,
        },
    });
    if (normalizedAliases.length > 0) {
        await db.masterCatalogItemAlias.createMany({
            data: normalizedAliases.map((alias) => ({
                masterItemId,
                language: alias.language,
                value: alias.value.trim(),
            })),
        });
    }
}
async function upsertMasterVariantTranslations(db, masterVariantTemplateId, translations) {
    await (0, translations_1.upsertTranslations)({
        entries: translations,
        listExisting: () => db.masterCatalogVariantTranslation.findMany({
            where: {
                masterVariantTemplateId,
            },
            select: {
                id: true,
                language: true,
            },
        }),
        create: (translation) => db.masterCatalogVariantTranslation.create({
            data: {
                masterVariantTemplateId,
                language: translation.language,
                name: translation.name.trim(),
            },
        }),
        update: (existing, translation) => db.masterCatalogVariantTranslation.update({
            where: {
                id: existing.id,
            },
            data: {
                name: translation.name.trim(),
            },
        }),
    });
}
async function normalizeMasterVariantDefaults(db, masterItemId, preferredDefaultCode) {
    const templates = await db.masterCatalogVariantTemplate.findMany({
        where: {
            masterItemId,
        },
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
            id: true,
            code: true,
            isDefault: true,
        },
    });
    if (templates.length === 0) {
        return;
    }
    const preferredTemplate = (preferredDefaultCode ? templates.find((template) => template.code === preferredDefaultCode) : null) ??
        templates.find((template) => template.isDefault) ??
        templates[0];
    if (!preferredTemplate) {
        return;
    }
    await db.masterCatalogVariantTemplate.updateMany({
        where: {
            masterItemId,
        },
        data: {
            isDefault: false,
        },
    });
    await db.masterCatalogVariantTemplate.update({
        where: {
            id: preferredTemplate.id,
        },
        data: {
            isDefault: true,
        },
    });
}
async function upsertMasterVariantTemplates(db, masterItemId, templates) {
    const existingTemplates = await db.masterCatalogVariantTemplate.findMany({
        where: {
            masterItemId,
        },
        select: {
            id: true,
            code: true,
        },
    });
    const desiredCodes = new Set(templates.map((template) => template.code.trim()));
    const removedTemplateIds = existingTemplates
        .filter((template) => !desiredCodes.has(template.code))
        .map((template) => template.id);
    if (removedTemplateIds.length) {
        await db.masterCatalogVariantTranslation.deleteMany({
            where: {
                masterVariantTemplateId: {
                    in: removedTemplateIds,
                },
            },
        });
        await db.masterCatalogVariantTemplate.deleteMany({
            where: {
                id: {
                    in: removedTemplateIds,
                },
            },
        });
    }
    if (templates.length === 0) {
        return;
    }
    const existingByCode = new Map(existingTemplates.map((template) => [template.code, template]));
    const preferredDefaultCode = templates.find((template) => template.isDefault)?.code;
    for (const template of templates) {
        const translations = await (0, autoTranslate_1.enrichWithAutoTranslations)({
            baseName: template.name,
            existingTranslations: template.translations,
        });
        const existing = existingByCode.get(template.code.trim());
        if (existing) {
            await db.masterCatalogVariantTemplate.update({
                where: {
                    id: existing.id,
                },
                data: {
                    name: template.name.trim(),
                    skuSuffix: template.skuSuffix?.trim() ?? null,
                    barcode: template.barcode?.trim() ?? null,
                    attributes: (0, json_1.toNullableJsonValue)(template.attributes),
                    defaultCostPrice: template.defaultCostPrice !== undefined ? (0, decimal_1.toDecimal)(template.defaultCostPrice) : undefined,
                    defaultSellingPrice: template.defaultSellingPrice !== undefined ? (0, decimal_1.toDecimal)(template.defaultSellingPrice) : undefined,
                    defaultMrp: template.defaultMrp !== undefined ? (0, decimal_1.toDecimal)(template.defaultMrp) : undefined,
                    reorderLevel: template.reorderLevel !== undefined ? (0, decimal_1.toDecimal)(template.reorderLevel) : undefined,
                    minStockLevel: template.minStockLevel !== undefined ? (0, decimal_1.toDecimal)(template.minStockLevel) : undefined,
                    maxStockLevel: template.maxStockLevel !== undefined ? (0, decimal_1.toDecimal)(template.maxStockLevel) : undefined,
                    weight: template.weight !== undefined ? (0, decimal_1.toDecimal)(template.weight) : undefined,
                    unitCode: template.unitCode?.trim() ?? null,
                    isActive: template.isActive ?? true,
                    sortOrder: template.sortOrder ?? 0,
                    metadata: (0, json_1.toNullableJsonValue)(template.metadata),
                },
            });
            await upsertMasterVariantTranslations(db, existing.id, translations);
            continue;
        }
        const created = await db.masterCatalogVariantTemplate.create({
            data: {
                masterItemId,
                code: template.code.trim(),
                name: template.name.trim(),
                skuSuffix: template.skuSuffix?.trim() ?? null,
                barcode: template.barcode?.trim() ?? null,
                attributes: (0, json_1.toNullableJsonValue)(template.attributes),
                defaultCostPrice: template.defaultCostPrice !== undefined ? (0, decimal_1.toDecimal)(template.defaultCostPrice) : null,
                defaultSellingPrice: template.defaultSellingPrice !== undefined ? (0, decimal_1.toDecimal)(template.defaultSellingPrice) : null,
                defaultMrp: template.defaultMrp !== undefined ? (0, decimal_1.toDecimal)(template.defaultMrp) : null,
                reorderLevel: template.reorderLevel !== undefined ? (0, decimal_1.toDecimal)(template.reorderLevel) : new client_1.Prisma.Decimal(0),
                minStockLevel: template.minStockLevel !== undefined ? (0, decimal_1.toDecimal)(template.minStockLevel) : new client_1.Prisma.Decimal(0),
                maxStockLevel: template.maxStockLevel !== undefined ? (0, decimal_1.toDecimal)(template.maxStockLevel) : null,
                weight: template.weight !== undefined ? (0, decimal_1.toDecimal)(template.weight) : null,
                unitCode: template.unitCode?.trim() ?? null,
                isDefault: template.isDefault ?? false,
                isActive: template.isActive ?? true,
                sortOrder: template.sortOrder ?? 0,
                metadata: (0, json_1.toNullableJsonValue)(template.metadata),
            },
        });
        await upsertMasterVariantTranslations(db, created.id, translations);
    }
    await normalizeMasterVariantDefaults(db, masterItemId, preferredDefaultCode);
}
async function getMasterCatalogCategories(query, localeContext) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        industryId: query.industryId,
        ...(query.parentId ? { parentId: query.parentId } : {}),
        ...(query.search
            ? {
                OR: [
                    { code: { contains: query.search, mode: "insensitive" } },
                    { slug: { contains: query.search, mode: "insensitive" } },
                    {
                        translations: {
                            some: {
                                OR: [
                                    { name: { contains: query.search, mode: "insensitive" } },
                                    { description: { contains: query.search, mode: "insensitive" } },
                                ],
                            },
                        },
                    },
                ],
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.masterCatalogCategory.findMany({
            where,
            include: masterCatalogCategoryInclude,
            orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
            skip,
            take: limit,
        }),
        prisma_1.prisma.masterCatalogCategory.count({ where }),
    ]);
    return {
        items: items.map((item) => serializeMasterCatalogCategory(item, localeContext)),
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function getMasterCatalogCategoryTree(query, localeContext) {
    const categories = await prisma_1.prisma.masterCatalogCategory.findMany({
        where: {
            industryId: query.industryId,
        },
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    const localizedCategories = categories.map((category) => (0, localization_1.serializeLocalizedEntity)({
        ...category,
        ...getMasterCategoryCanonicalFields(category),
    }, localeContext));
    const map = new Map(localizedCategories.map((category) => [
        category.id,
        {
            ...category,
            children: [],
        },
    ]));
    const roots = [];
    for (const category of categories) {
        const current = map.get(category.id);
        if (category.parentId && map.has(category.parentId)) {
            map.get(category.parentId).children.push(current);
            continue;
        }
        roots.push(current);
    }
    return roots;
}
async function createMasterCatalogCategory(actorUserId, input, localeContext) {
    const category = await prisma_1.prisma.$transaction(async (tx) => {
        const created = await tx.masterCatalogCategory.create({
            data: {
                industryId: input.industryId,
                parentId: input.parentId ?? null,
                code: (0, slug_1.slugify)(input.code).replace(/-/g, "_"),
                slug: (0, slug_1.slugify)(input.slug ?? input.code),
                sortOrder: input.sortOrder ?? 0,
                iconKey: input.iconKey?.trim() ?? null,
                imageUrl: input.imageUrl?.trim() ?? null,
                isActive: input.isActive ?? true,
                metadata: (0, json_1.toNullableJsonValue)(input.metadata),
            },
        });
        await upsertMasterCategoryTranslations(tx, created.id, input.translations);
        return created;
    });
    const record = await getMasterCatalogCategoryRecordById(category.id);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "MasterCatalogCategory",
        entityId: category.id,
        after: record,
    });
    return serializeMasterCatalogCategory(record, localeContext);
}
async function updateMasterCatalogCategory(categoryId, actorUserId, input, localeContext) {
    const existing = await getMasterCatalogCategoryRecordById(categoryId);
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.masterCatalogCategory.update({
            where: {
                id: categoryId,
            },
            data: {
                ...(input.industryId !== undefined ? { industryId: input.industryId } : {}),
                ...(input.parentId !== undefined ? { parentId: input.parentId || null } : {}),
                ...(input.code ? { code: (0, slug_1.slugify)(input.code).replace(/-/g, "_") } : {}),
                ...(input.slug ? { slug: (0, slug_1.slugify)(input.slug) } : {}),
                ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
                ...(input.iconKey !== undefined ? { iconKey: input.iconKey || null } : {}),
                ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl || null } : {}),
                ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                ...(input.metadata !== undefined ? { metadata: (0, json_1.toNullableJsonValue)(input.metadata) } : {}),
            },
        });
        await upsertMasterCategoryTranslations(tx, categoryId, input.translations ?? []);
    });
    const updated = await getMasterCatalogCategoryRecordById(categoryId);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "MasterCatalogCategory",
        entityId: categoryId,
        before: existing,
        after: updated,
    });
    return serializeMasterCatalogCategory(updated, localeContext);
}
async function getMasterCatalogItems(query, localeContext, currentOrganizationId) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const normalizedQuery = query.q?.trim().toLowerCase();
    const where = {
        industryId: query.industryId,
        ...(query.categoryId ? { masterCategoryId: query.categoryId } : {}),
        ...(query.hasVariants !== undefined ? { hasVariants: query.hasVariants } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(normalizedQuery
            ? {
                OR: [
                    { searchText: { contains: normalizedQuery } },
                    { code: { contains: normalizedQuery, mode: "insensitive" } },
                    { slug: { contains: normalizedQuery, mode: "insensitive" } },
                ],
            }
            : {}),
    };
    const [items, totalItems, organizationIndustryIds] = await Promise.all([
        prisma_1.prisma.masterCatalogItem.findMany({
            where,
            include: masterCatalogItemInclude,
            orderBy: [{ canonicalName: "asc" }],
            skip,
            take: limit,
        }),
        prisma_1.prisma.masterCatalogItem.count({ where }),
        getOrganizationIndustryIds(currentOrganizationId),
    ]);
    return {
        items: items.map((item) => serializeMasterCatalogItem(item, localeContext, {
            currentOrganizationId,
            organizationIndustryIds,
        })),
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function getMasterCatalogItemById(itemId, localeContext, currentOrganizationId) {
    const [item, organizationIndustryIds] = await Promise.all([
        getMasterCatalogItemRecordById(itemId),
        getOrganizationIndustryIds(currentOrganizationId),
    ]);
    return serializeMasterCatalogItem(item, localeContext, {
        currentOrganizationId,
        organizationIndustryIds,
    });
}
async function createMasterCatalogItem(actorUserId, input, localeContext) {
    const translations = await (0, autoTranslate_1.enrichWithAutoTranslations)({
        baseName: input.canonicalName,
        baseDescription: input.canonicalDescription,
        existingTranslations: input.translations,
    });
    const item = await prisma_1.prisma.$transaction(async (tx) => {
        const created = await tx.masterCatalogItem.create({
            data: {
                industryId: input.industryId,
                masterCategoryId: input.masterCategoryId ?? null,
                code: (0, slug_1.slugify)(input.code).replace(/-/g, "_"),
                slug: (0, slug_1.slugify)(input.slug ?? input.code),
                canonicalName: input.canonicalName.trim(),
                canonicalDescription: input.canonicalDescription?.trim() ?? null,
                productType: input.productType,
                defaultTrackMethod: input.defaultTrackMethod,
                defaultUnitCode: input.defaultUnitCode?.trim() ?? null,
                defaultBrandName: input.defaultBrandName?.trim() ?? null,
                defaultTaxCode: input.defaultTaxCode?.trim() ?? null,
                hasVariants: input.hasVariants ?? false,
                trackInventory: input.trackInventory ?? true,
                allowBackorder: input.allowBackorder ?? false,
                allowNegativeStock: input.allowNegativeStock ?? false,
                defaultImageUrl: input.defaultImageUrl?.trim() ?? null,
                tags: (0, json_1.toNullableJsonValue)(input.tags),
                customFieldsTemplate: (0, json_1.toNullableJsonValue)(input.customFieldsTemplate),
                metadata: (0, json_1.toNullableJsonValue)(input.metadata),
                searchText: "",
                isActive: input.isActive ?? true,
            },
        });
        await upsertMasterItemTranslations(tx, created.id, translations);
        await replaceMasterItemAliases(tx, created.id, input.aliases ?? []);
        await upsertMasterVariantTemplates(tx, created.id, input.variantTemplates ?? []);
        await rebuildMasterItemSearchText(tx, created.id);
        return created;
    });
    const record = await getMasterCatalogItemRecordById(item.id);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "MasterCatalogItem",
        entityId: item.id,
        after: record,
    });
    return serializeMasterCatalogItem(record, localeContext);
}
async function updateMasterCatalogItem(itemId, actorUserId, input, localeContext) {
    const existing = await getMasterCatalogItemRecordById(itemId);
    const translations = await (0, autoTranslate_1.enrichWithAutoTranslations)({
        baseName: input.canonicalName ?? existing.canonicalName,
        baseDescription: input.canonicalDescription ?? existing.canonicalDescription ?? undefined,
        existingTranslations: input.translations ??
            existing.translations.map((translation) => ({
                language: translation.language,
                name: translation.name,
                shortName: translation.shortName ?? undefined,
                description: translation.description ?? undefined,
            })),
    });
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.masterCatalogItem.update({
            where: {
                id: itemId,
            },
            data: {
                ...(input.industryId !== undefined ? { industryId: input.industryId } : {}),
                ...(input.masterCategoryId !== undefined ? { masterCategoryId: input.masterCategoryId || null } : {}),
                ...(input.code ? { code: (0, slug_1.slugify)(input.code).replace(/-/g, "_") } : {}),
                ...(input.slug ? { slug: (0, slug_1.slugify)(input.slug) } : {}),
                ...(input.canonicalName ? { canonicalName: input.canonicalName.trim() } : {}),
                ...(input.canonicalDescription !== undefined
                    ? { canonicalDescription: input.canonicalDescription?.trim() ?? null }
                    : {}),
                ...(input.productType ? { productType: input.productType } : {}),
                ...(input.defaultTrackMethod ? { defaultTrackMethod: input.defaultTrackMethod } : {}),
                ...(input.defaultUnitCode !== undefined ? { defaultUnitCode: input.defaultUnitCode || null } : {}),
                ...(input.defaultBrandName !== undefined ? { defaultBrandName: input.defaultBrandName || null } : {}),
                ...(input.defaultTaxCode !== undefined ? { defaultTaxCode: input.defaultTaxCode || null } : {}),
                ...(input.hasVariants !== undefined ? { hasVariants: input.hasVariants } : {}),
                ...(input.trackInventory !== undefined ? { trackInventory: input.trackInventory } : {}),
                ...(input.allowBackorder !== undefined ? { allowBackorder: input.allowBackorder } : {}),
                ...(input.allowNegativeStock !== undefined ? { allowNegativeStock: input.allowNegativeStock } : {}),
                ...(input.defaultImageUrl !== undefined ? { defaultImageUrl: input.defaultImageUrl || null } : {}),
                ...(input.tags !== undefined ? { tags: (0, json_1.toNullableJsonValue)(input.tags) } : {}),
                ...(input.customFieldsTemplate !== undefined
                    ? { customFieldsTemplate: (0, json_1.toNullableJsonValue)(input.customFieldsTemplate) }
                    : {}),
                ...(input.metadata !== undefined ? { metadata: (0, json_1.toNullableJsonValue)(input.metadata) } : {}),
                ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
            },
        });
        await upsertMasterItemTranslations(tx, itemId, translations);
        if (input.aliases !== undefined) {
            await replaceMasterItemAliases(tx, itemId, input.aliases);
        }
        if (input.variantTemplates !== undefined) {
            await upsertMasterVariantTemplates(tx, itemId, input.variantTemplates);
        }
        await rebuildMasterItemSearchText(tx, itemId);
    });
    const updated = await getMasterCatalogItemRecordById(itemId);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "MasterCatalogItem",
        entityId: itemId,
        before: existing,
        after: updated,
    });
    return serializeMasterCatalogItem(updated, localeContext);
}
async function getFeaturedMasterCatalogItems(industryId, query, localeContext, currentOrganizationId) {
    const [items, organizationIndustryIds] = await Promise.all([
        prisma_1.prisma.masterCatalogItem.findMany({
            where: {
                industryId,
                isActive: true,
            },
            include: masterCatalogItemInclude,
            orderBy: [{ canonicalName: "asc" }],
            take: query.limit,
        }),
        getOrganizationIndustryIds(currentOrganizationId),
    ]);
    return items.map((item) => serializeMasterCatalogItem(item, localeContext, {
        currentOrganizationId,
        organizationIndustryIds,
    }));
}
