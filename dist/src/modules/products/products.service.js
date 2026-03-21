"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProducts = listProducts;
exports.createProduct = createProduct;
exports.getProductById = getProductById;
exports.updateProduct = updateProduct;
exports.deleteProduct = deleteProduct;
exports.listVariants = listVariants;
exports.createVariant = createVariant;
exports.updateVariant = updateVariant;
exports.deleteVariant = deleteVariant;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const decimal_1 = require("../../utils/decimal");
const ApiError_1 = require("../../utils/ApiError");
const guards_1 = require("../../utils/guards");
const localization_1 = require("../../utils/localization");
const pagination_1 = require("../../utils/pagination");
const slug_1 = require("../../utils/slug");
const translations_1 = require("../../utils/translations");
const json_1 = require("../../utils/json");
const autoTranslate_1 = require("../../utils/autoTranslate");
const audit_service_1 = require("../audit/audit.service");
const productInclude = {
    translations: {
        orderBy: {
            language: "asc",
        },
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
    brand: true,
    taxRate: true,
    primaryUnit: true,
    masterCatalogItem: {
        select: {
            id: true,
            code: true,
            slug: true,
            canonicalName: true,
        },
    },
    variants: {
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
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    },
};
function serializeVariant(variant, localeContext) {
    return (0, localization_1.serializeLocalizedEntity)(variant, localeContext);
}
function serializeProduct(product, localeContext) {
    const localizedProduct = (0, localization_1.serializeLocalizedEntity)(product, localeContext);
    return {
        ...localizedProduct,
        category: product.category ? (0, localization_1.serializeLocalizedEntity)(product.category, localeContext) : null,
        variants: product.variants.map((variant) => serializeVariant(variant, localeContext)),
    };
}
async function getProductRecordById(organizationId, productId) {
    const product = await prisma_1.prisma.product.findFirst({
        where: {
            id: productId,
            organizationId,
            deletedAt: null,
        },
        include: productInclude,
    });
    if (!product) {
        throw ApiError_1.ApiError.notFound("Product not found");
    }
    return product;
}
async function validateProductReferences(organizationId, input) {
    if (input.categoryId) {
        await (0, guards_1.assertCategoryInOrg)(prisma_1.prisma, organizationId, input.categoryId);
    }
    if (input.brandId) {
        await (0, guards_1.assertBrandInOrg)(prisma_1.prisma, organizationId, input.brandId);
    }
    if (input.taxRateId) {
        await (0, guards_1.assertTaxRateInOrg)(prisma_1.prisma, organizationId, input.taxRateId);
    }
    if (input.industryId) {
        await (0, guards_1.assertIndustryExists)(prisma_1.prisma, input.industryId);
    }
    if (input.primaryUnitId) {
        await (0, guards_1.assertUnitAvailable)(prisma_1.prisma, organizationId, input.primaryUnitId);
    }
}
async function validateVariantReferenceUnits(organizationId, variants) {
    for (const variant of variants) {
        if (variant.unitId) {
            await (0, guards_1.assertUnitAvailable)(prisma_1.prisma, organizationId, variant.unitId);
        }
    }
}
function ensureRequestVariantUniqueness(variants) {
    const skuSet = new Set();
    const barcodeSet = new Set();
    for (const variant of variants) {
        const sku = variant.sku.trim();
        if (skuSet.has(sku)) {
            throw ApiError_1.ApiError.badRequest("Duplicate SKU found in request payload");
        }
        skuSet.add(sku);
        if (variant.barcode) {
            const barcode = variant.barcode.trim();
            if (barcodeSet.has(barcode)) {
                throw ApiError_1.ApiError.badRequest("Duplicate barcode found in request payload");
            }
            barcodeSet.add(barcode);
        }
    }
}
async function ensureVariantUniquenessInDb(organizationId, variants, excludeVariantId) {
    for (const variant of variants) {
        const existingSku = await prisma_1.prisma.productVariant.findFirst({
            where: {
                organizationId,
                sku: variant.sku.trim(),
                deletedAt: null,
                ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}),
            },
            select: { id: true },
        });
        if (existingSku) {
            throw ApiError_1.ApiError.conflict(`SKU ${variant.sku.trim()} already exists`);
        }
        if (variant.barcode) {
            const existingBarcode = await prisma_1.prisma.productVariant.findFirst({
                where: {
                    organizationId,
                    barcode: variant.barcode.trim(),
                    deletedAt: null,
                    ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}),
                },
                select: { id: true },
            });
            if (existingBarcode) {
                throw ApiError_1.ApiError.conflict(`Barcode ${variant.barcode.trim()} already exists`);
            }
        }
    }
}
function normalizeVariantPayload(productName, hasVariants, variants) {
    let defaultIndex = variants.findIndex((variant) => variant.isDefault);
    if (defaultIndex < 0) {
        defaultIndex = 0;
    }
    return variants.map((variant, index) => ({
        name: variant.name?.trim() || (hasVariants ? `${productName.trim()} ${index + 1}` : productName.trim()),
        sku: variant.sku.trim(),
        barcode: variant.barcode?.trim() || null,
        attributes: (0, json_1.toNullableJsonValue)(variant.attributes),
        costPrice: (0, decimal_1.toDecimal)(variant.costPrice),
        sellingPrice: (0, decimal_1.toDecimal)(variant.sellingPrice),
        mrp: variant.mrp !== undefined ? (0, decimal_1.toDecimal)(variant.mrp) : null,
        reorderLevel: variant.reorderLevel !== undefined ? (0, decimal_1.toDecimal)(variant.reorderLevel) : new client_1.Prisma.Decimal(0),
        minStockLevel: variant.minStockLevel !== undefined ? (0, decimal_1.toDecimal)(variant.minStockLevel) : new client_1.Prisma.Decimal(0),
        maxStockLevel: variant.maxStockLevel !== undefined ? (0, decimal_1.toDecimal)(variant.maxStockLevel) : null,
        weight: variant.weight !== undefined ? (0, decimal_1.toDecimal)(variant.weight) : null,
        unitId: variant.unitId ?? null,
        isDefault: index === defaultIndex,
        isActive: variant.isActive ?? true,
        imageUrl: variant.imageUrl ?? null,
        customFields: (0, json_1.toNullableJsonValue)(variant.customFields),
        metadata: (0, json_1.toNullableJsonValue)(variant.metadata),
        translations: variant.translations ?? [],
    }));
}
async function upsertProductTranslations(db, productId, translations) {
    await (0, translations_1.upsertTranslations)({
        entries: translations,
        listExisting: () => db.productTranslation.findMany({
            where: {
                productId,
            },
            select: {
                id: true,
                language: true,
            },
        }),
        create: (translation) => db.productTranslation.create({
            data: {
                productId,
                language: translation.language,
                name: translation.name.trim(),
                description: translation.description?.trim() ?? null,
            },
        }),
        update: (existing, translation) => db.productTranslation.update({
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
async function upsertVariantTranslations(db, variantId, translations) {
    await (0, translations_1.upsertTranslations)({
        entries: translations,
        listExisting: () => db.productVariantTranslation.findMany({
            where: {
                variantId,
            },
            select: {
                id: true,
                language: true,
            },
        }),
        create: (translation) => db.productVariantTranslation.create({
            data: {
                variantId,
                language: translation.language,
                name: translation.name.trim(),
            },
        }),
        update: (existing, translation) => db.productVariantTranslation.update({
            where: {
                id: existing.id,
            },
            data: {
                name: translation.name.trim(),
            },
        }),
    });
}
async function createVariantRecord(db, organizationId, productId, input) {
    const variant = await db.productVariant.create({
        data: {
            organizationId,
            productId,
            name: input.name,
            sku: input.sku,
            barcode: input.barcode,
            attributes: input.attributes,
            costPrice: input.costPrice,
            sellingPrice: input.sellingPrice,
            mrp: input.mrp,
            reorderLevel: input.reorderLevel,
            minStockLevel: input.minStockLevel,
            maxStockLevel: input.maxStockLevel,
            weight: input.weight,
            unitId: input.unitId,
            isDefault: input.isDefault,
            isActive: input.isActive,
            imageUrl: input.imageUrl,
            customFields: input.customFields,
            metadata: input.metadata,
        },
    });
    await upsertVariantTranslations(db, variant.id, input.translations);
    return variant;
}
async function listProducts(organizationId, query, localeContext) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.brandId ? { brandId: query.brandId } : {}),
        ...(query.hasVariants !== undefined ? { hasVariants: query.hasVariants } : {}),
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
                    {
                        variants: {
                            some: {
                                deletedAt: null,
                                OR: [
                                    { name: { contains: query.search, mode: "insensitive" } },
                                    { sku: { contains: query.search, mode: "insensitive" } },
                                    { barcode: { contains: query.search, mode: "insensitive" } },
                                    {
                                        translations: {
                                            some: {
                                                name: { contains: query.search, mode: "insensitive" },
                                            },
                                        },
                                    },
                                ],
                            },
                        },
                    },
                ],
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.product.findMany({
            where,
            include: productInclude,
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take: limit,
        }),
        prisma_1.prisma.product.count({ where }),
    ]);
    return {
        items: items.map((item) => serializeProduct(item, localeContext)),
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createProduct(organizationId, actorUserId, input, localeContext) {
    await validateProductReferences(organizationId, input);
    const computedHasVariants = input.productType === client_1.ProductType.VARIABLE || input.hasVariants === true;
    if (computedHasVariants && input.productType !== client_1.ProductType.VARIABLE) {
        throw ApiError_1.ApiError.badRequest("Products with variants must use productType VARIABLE");
    }
    const rawVariants = (computedHasVariants
        ? input.variants ?? (input.defaultVariant ? [input.defaultVariant] : [])
        : input.defaultVariant
            ? [input.defaultVariant]
            : input.variants?.length
                ? [input.variants[0]]
                : []).filter((variant) => Boolean(variant));
    if (rawVariants.length === 0) {
        throw ApiError_1.ApiError.badRequest(computedHasVariants
            ? "Variable products require at least one variant"
            : "Simple products require a default variant");
    }
    if (!computedHasVariants && rawVariants.length > 1) {
        throw ApiError_1.ApiError.badRequest("Simple products can only have one active default variant");
    }
    await validateVariantReferenceUnits(organizationId, rawVariants);
    ensureRequestVariantUniqueness(rawVariants);
    await ensureVariantUniquenessInDb(organizationId, rawVariants);
    const translations = await (0, autoTranslate_1.enrichWithAutoTranslations)({
        organizationId,
        baseName: input.name,
        baseDescription: input.description,
        existingTranslations: input.translations,
    });
    const normalizedVariants = normalizeVariantPayload(input.name, computedHasVariants, rawVariants);
    const slug = (0, slug_1.slugify)(input.slug ?? input.name);
    const productId = await prisma_1.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
            data: {
                organizationId,
                categoryId: input.categoryId ?? null,
                brandId: input.brandId ?? null,
                taxRateId: input.taxRateId ?? null,
                industryId: input.industryId ?? null,
                name: input.name.trim(),
                slug,
                description: input.description ?? null,
                productType: input.productType,
                sourceType: client_1.ProductSourceType.MANUAL,
                status: input.status ?? client_1.ProductStatus.ACTIVE,
                hasVariants: computedHasVariants,
                trackInventory: input.trackInventory ?? true,
                allowBackorder: input.allowBackorder ?? false,
                allowNegativeStock: input.allowNegativeStock ?? false,
                trackMethod: input.trackMethod ?? client_1.TrackMethod.PIECE,
                primaryUnitId: input.primaryUnitId ?? null,
                imageUrl: input.imageUrl ?? null,
                tags: (0, json_1.toNullableJsonValue)(input.tags),
                customFields: (0, json_1.toNullableJsonValue)(input.customFields),
                metadata: (0, json_1.toNullableJsonValue)(input.metadata),
                createdById: actorUserId,
                updatedById: actorUserId,
            },
        });
        await upsertProductTranslations(tx, product.id, translations);
        for (const variant of normalizedVariants) {
            await createVariantRecord(tx, organizationId, product.id, variant);
        }
        return product.id;
    });
    const product = await getProductRecordById(organizationId, productId);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "Product",
        entityId: product.id,
        after: product,
    });
    return serializeProduct(product, localeContext);
}
async function getProductById(organizationId, productId, localeContext) {
    return serializeProduct(await getProductRecordById(organizationId, productId), localeContext);
}
async function updateProduct(organizationId, productId, actorUserId, input, localeContext) {
    const existing = await getProductRecordById(organizationId, productId);
    await validateProductReferences(organizationId, input);
    const nextHasVariants = input.hasVariants ?? existing.hasVariants;
    const nextProductType = input.productType ?? existing.productType;
    if (nextHasVariants && nextProductType !== client_1.ProductType.VARIABLE) {
        throw ApiError_1.ApiError.badRequest("Products with variants must use productType VARIABLE");
    }
    if (!nextHasVariants && existing.variants.length > 1) {
        throw ApiError_1.ApiError.badRequest("Cannot convert a product with multiple variants into a simple product");
    }
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.product.update({
            where: { id: productId },
            data: {
                ...(input.categoryId !== undefined ? { categoryId: input.categoryId || null } : {}),
                ...(input.brandId !== undefined ? { brandId: input.brandId || null } : {}),
                ...(input.taxRateId !== undefined ? { taxRateId: input.taxRateId || null } : {}),
                ...(input.industryId !== undefined ? { industryId: input.industryId || null } : {}),
                ...(input.name ? { name: input.name.trim() } : {}),
                ...(input.slug ? { slug: (0, slug_1.slugify)(input.slug) } : {}),
                ...(input.description !== undefined ? { description: input.description || null } : {}),
                ...(input.productType ? { productType: input.productType } : {}),
                ...(input.status ? { status: input.status } : {}),
                ...(input.hasVariants !== undefined ? { hasVariants: input.hasVariants } : {}),
                ...(input.trackInventory !== undefined ? { trackInventory: input.trackInventory } : {}),
                ...(input.allowBackorder !== undefined ? { allowBackorder: input.allowBackorder } : {}),
                ...(input.allowNegativeStock !== undefined ? { allowNegativeStock: input.allowNegativeStock } : {}),
                ...(input.trackMethod ? { trackMethod: input.trackMethod } : {}),
                ...(input.primaryUnitId !== undefined ? { primaryUnitId: input.primaryUnitId || null } : {}),
                ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl || null } : {}),
                ...(input.tags !== undefined ? { tags: (0, json_1.toNullableJsonValue)(input.tags) } : {}),
                ...(input.customFields !== undefined ? { customFields: (0, json_1.toNullableJsonValue)(input.customFields) } : {}),
                ...(input.metadata !== undefined ? { metadata: (0, json_1.toNullableJsonValue)(input.metadata) } : {}),
                updatedById: actorUserId,
            },
        });
        await upsertProductTranslations(tx, productId, input.translations ?? []);
    });
    const updated = await getProductRecordById(organizationId, productId);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "Product",
        entityId: updated.id,
        before: existing,
        after: updated,
    });
    return serializeProduct(updated, localeContext);
}
async function deleteProduct(organizationId, productId, actorUserId) {
    const existing = await getProductRecordById(organizationId, productId);
    const deleted = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.productVariant.updateMany({
            where: {
                productId,
                deletedAt: null,
            },
            data: {
                isActive: false,
                deletedAt: new Date(),
            },
        });
        return tx.product.update({
            where: { id: productId },
            data: {
                status: client_1.ProductStatus.ARCHIVED,
                deletedAt: new Date(),
                updatedById: actorUserId,
            },
        });
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.DELETE,
        entityType: "Product",
        entityId: deleted.id,
        before: existing,
        after: deleted,
    });
    return deleted;
}
async function listVariants(organizationId, productId, localeContext) {
    const product = await getProductRecordById(organizationId, productId);
    return product.variants.map((variant) => serializeVariant(variant, localeContext));
}
async function createVariant(organizationId, productId, actorUserId, input, localeContext) {
    const product = await getProductRecordById(organizationId, productId);
    if (product.status === client_1.ProductStatus.ARCHIVED) {
        throw ApiError_1.ApiError.badRequest("Cannot create variant for archived product");
    }
    if (!product.hasVariants || product.productType !== client_1.ProductType.VARIABLE) {
        throw ApiError_1.ApiError.badRequest("Variants can only be added to variable products");
    }
    await validateVariantReferenceUnits(organizationId, [input]);
    ensureRequestVariantUniqueness([input]);
    await ensureVariantUniquenessInDb(organizationId, [input]);
    const shouldBeDefault = input.isDefault ?? product.variants.every((variant) => !variant.isDefault);
    const normalized = normalizeVariantPayload(product.name, true, [{ ...input, isDefault: shouldBeDefault }])[0];
    const created = await prisma_1.prisma.$transaction(async (tx) => {
        if (shouldBeDefault) {
            await tx.productVariant.updateMany({
                where: {
                    organizationId,
                    productId,
                    deletedAt: null,
                },
                data: {
                    isDefault: false,
                },
            });
        }
        return createVariantRecord(tx, organizationId, productId, normalized);
    });
    const createdVariant = await prisma_1.prisma.productVariant.findUniqueOrThrow({
        where: { id: created.id },
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "ProductVariant",
        entityId: created.id,
        after: createdVariant,
    });
    return serializeVariant(createdVariant, localeContext);
}
async function updateVariant(organizationId, productId, variantId, actorUserId, input, localeContext) {
    const product = await getProductRecordById(organizationId, productId);
    const existing = await (0, guards_1.assertVariantInOrg)(prisma_1.prisma, organizationId, variantId);
    if (existing.productId !== productId) {
        throw ApiError_1.ApiError.badRequest("Variant does not belong to the selected product");
    }
    if (product.status === client_1.ProductStatus.ARCHIVED) {
        throw ApiError_1.ApiError.badRequest("Cannot edit variants for archived product");
    }
    if (input.unitId) {
        await (0, guards_1.assertUnitAvailable)(prisma_1.prisma, organizationId, input.unitId);
    }
    await ensureVariantUniquenessInDb(organizationId, [
        {
            sku: input.sku ?? existing.sku,
            barcode: input.barcode ?? existing.barcode ?? undefined,
            costPrice: input.costPrice ?? existing.costPrice,
            sellingPrice: input.sellingPrice ?? existing.sellingPrice,
        },
    ], variantId);
    const shouldBeDefault = input.isDefault === true;
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        if (shouldBeDefault) {
            await tx.productVariant.updateMany({
                where: {
                    organizationId,
                    productId,
                    deletedAt: null,
                },
                data: {
                    isDefault: false,
                },
            });
        }
        if (!product.hasVariants && input.isActive === false) {
            throw ApiError_1.ApiError.badRequest("Simple products must keep one active default variant");
        }
        const variant = await tx.productVariant.update({
            where: { id: variantId },
            data: {
                ...(input.name !== undefined ? { name: input.name || product.name } : {}),
                ...(input.sku ? { sku: input.sku.trim() } : {}),
                ...(input.barcode !== undefined ? { barcode: input.barcode || null } : {}),
                ...(input.attributes !== undefined ? { attributes: (0, json_1.toNullableJsonValue)(input.attributes) } : {}),
                ...(input.costPrice !== undefined ? { costPrice: (0, decimal_1.toDecimal)(input.costPrice) } : {}),
                ...(input.sellingPrice !== undefined ? { sellingPrice: (0, decimal_1.toDecimal)(input.sellingPrice) } : {}),
                ...(input.mrp !== undefined ? { mrp: (0, decimal_1.toDecimal)(input.mrp) } : {}),
                ...(input.reorderLevel !== undefined ? { reorderLevel: (0, decimal_1.toDecimal)(input.reorderLevel) } : {}),
                ...(input.minStockLevel !== undefined ? { minStockLevel: (0, decimal_1.toDecimal)(input.minStockLevel) } : {}),
                ...(input.maxStockLevel !== undefined ? { maxStockLevel: (0, decimal_1.toDecimal)(input.maxStockLevel) } : {}),
                ...(input.weight !== undefined ? { weight: (0, decimal_1.toDecimal)(input.weight) } : {}),
                ...(input.unitId !== undefined
                    ? input.unitId
                        ? { unit: { connect: { id: input.unitId } } }
                        : { unit: { disconnect: true } }
                    : {}),
                ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
                ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl || null } : {}),
                ...(input.customFields !== undefined ? { customFields: (0, json_1.toNullableJsonValue)(input.customFields) } : {}),
                ...(input.metadata !== undefined ? { metadata: (0, json_1.toNullableJsonValue)(input.metadata) } : {}),
            },
        });
        await upsertVariantTranslations(tx, variantId, input.translations ?? []);
        return variant;
    });
    const updatedVariant = await prisma_1.prisma.productVariant.findUniqueOrThrow({
        where: {
            id: updated.id,
        },
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "ProductVariant",
        entityId: updated.id,
        before: existing,
        after: updatedVariant,
    });
    return serializeVariant(updatedVariant, localeContext);
}
async function deleteVariant(organizationId, productId, variantId, actorUserId) {
    const product = await getProductRecordById(organizationId, productId);
    const existing = await (0, guards_1.assertVariantInOrg)(prisma_1.prisma, organizationId, variantId);
    if (existing.productId !== productId) {
        throw ApiError_1.ApiError.badRequest("Variant does not belong to the selected product");
    }
    const activeVariants = product.variants;
    if (!product.hasVariants || activeVariants.length <= 1) {
        throw ApiError_1.ApiError.badRequest("Simple products must keep exactly one active default variant");
    }
    const deleted = await prisma_1.prisma.$transaction(async (tx) => {
        const removed = await tx.productVariant.update({
            where: { id: variantId },
            data: {
                isActive: false,
                deletedAt: new Date(),
                isDefault: false,
            },
        });
        if (existing.isDefault) {
            const fallback = await tx.productVariant.findFirst({
                where: {
                    organizationId,
                    productId,
                    deletedAt: null,
                    id: {
                        not: variantId,
                    },
                },
                orderBy: {
                    createdAt: "asc",
                },
            });
            if (fallback) {
                await tx.productVariant.update({
                    where: { id: fallback.id },
                    data: {
                        isDefault: true,
                    },
                });
            }
        }
        return removed;
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.DELETE,
        entityType: "ProductVariant",
        entityId: deleted.id,
        before: existing,
        after: deleted,
    });
    return deleted;
}
