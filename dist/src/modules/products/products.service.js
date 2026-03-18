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
const pagination_1 = require("../../utils/pagination");
const slug_1 = require("../../utils/slug");
const json_1 = require("../../utils/json");
const audit_service_1 = require("../audit/audit.service");
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
        reorderLevel: variant.reorderLevel !== undefined ? (0, decimal_1.toDecimal)(variant.reorderLevel) : 0,
        minStockLevel: variant.minStockLevel !== undefined ? (0, decimal_1.toDecimal)(variant.minStockLevel) : 0,
        maxStockLevel: variant.maxStockLevel !== undefined ? (0, decimal_1.toDecimal)(variant.maxStockLevel) : null,
        weight: variant.weight !== undefined ? (0, decimal_1.toDecimal)(variant.weight) : null,
        unitId: variant.unitId ?? null,
        isDefault: index === defaultIndex,
        isActive: variant.isActive ?? true,
        imageUrl: variant.imageUrl ?? null,
        customFields: (0, json_1.toNullableJsonValue)(variant.customFields),
        metadata: (0, json_1.toNullableJsonValue)(variant.metadata),
    }));
}
async function listProducts(organizationId, query) {
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
                        variants: {
                            some: {
                                deletedAt: null,
                                OR: [
                                    { name: { contains: query.search, mode: "insensitive" } },
                                    { sku: { contains: query.search, mode: "insensitive" } },
                                    { barcode: { contains: query.search, mode: "insensitive" } },
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
            include: {
                category: true,
                brand: true,
                taxRate: true,
                primaryUnit: true,
                variants: {
                    where: {
                        deletedAt: null,
                    },
                    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
                },
            },
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take: limit,
        }),
        prisma_1.prisma.product.count({ where }),
    ]);
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createProduct(organizationId, actorUserId, input) {
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
        await tx.productVariant.createMany({
            data: normalizedVariants.map((variant) => ({
                organizationId,
                productId: product.id,
                ...variant,
            })),
        });
        return product.id;
    });
    const product = await getProductById(organizationId, productId);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "Product",
        entityId: product.id,
        after: product,
    });
    return product;
}
async function getProductById(organizationId, productId) {
    const product = await prisma_1.prisma.product.findFirst({
        where: {
            id: productId,
            organizationId,
            deletedAt: null,
        },
        include: {
            category: true,
            brand: true,
            taxRate: true,
            primaryUnit: true,
            variants: {
                where: {
                    deletedAt: null,
                },
                orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            },
        },
    });
    if (!product) {
        throw ApiError_1.ApiError.notFound("Product not found");
    }
    return product;
}
async function updateProduct(organizationId, productId, actorUserId, input) {
    const existing = await getProductById(organizationId, productId);
    await validateProductReferences(organizationId, input);
    const nextHasVariants = input.hasVariants ?? existing.hasVariants;
    const nextProductType = input.productType ?? existing.productType;
    if (nextHasVariants && nextProductType !== client_1.ProductType.VARIABLE) {
        throw ApiError_1.ApiError.badRequest("Products with variants must use productType VARIABLE");
    }
    if (!nextHasVariants && existing.variants.filter((variant) => !variant.deletedAt).length > 1) {
        throw ApiError_1.ApiError.badRequest("Cannot convert a product with multiple variants into a simple product");
    }
    const updated = await prisma_1.prisma.product.update({
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
        include: {
            variants: {
                where: {
                    deletedAt: null,
                },
            },
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "Product",
        entityId: updated.id,
        before: existing,
        after: updated,
    });
    return updated;
}
async function deleteProduct(organizationId, productId, actorUserId) {
    const existing = await getProductById(organizationId, productId);
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
async function listVariants(organizationId, productId) {
    await (0, guards_1.assertProductInOrg)(prisma_1.prisma, organizationId, productId);
    return prisma_1.prisma.productVariant.findMany({
        where: {
            organizationId,
            productId,
            deletedAt: null,
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
}
async function createVariant(organizationId, productId, actorUserId, input) {
    const product = await getProductById(organizationId, productId);
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
        return tx.productVariant.create({
            data: {
                organizationId,
                productId,
                ...normalized,
            },
        });
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "ProductVariant",
        entityId: created.id,
        after: created,
    });
    return created;
}
async function updateVariant(organizationId, productId, variantId, actorUserId, input) {
    const product = await getProductById(organizationId, productId);
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
        return tx.productVariant.update({
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
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "ProductVariant",
        entityId: updated.id,
        before: existing,
        after: updated,
    });
    return updated;
}
async function deleteVariant(organizationId, productId, variantId, actorUserId) {
    const product = await getProductById(organizationId, productId);
    const existing = await (0, guards_1.assertVariantInOrg)(prisma_1.prisma, organizationId, variantId);
    if (existing.productId !== productId) {
        throw ApiError_1.ApiError.badRequest("Variant does not belong to the selected product");
    }
    const activeVariants = product.variants.filter((variant) => variant.deletedAt === null);
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
