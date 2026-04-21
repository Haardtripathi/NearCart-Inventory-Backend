"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMarketplaceOrganizations = listMarketplaceOrganizations;
exports.listMarketplaceCatalog = listMarketplaceCatalog;
exports.getMarketplaceCatalogProduct = getMarketplaceCatalogProduct;
exports.checkMarketplaceAvailability = checkMarketplaceAvailability;
exports.listMarketplaceCategories = listMarketplaceCategories;
exports.listMarketplaceBrands = listMarketplaceBrands;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const localization_1 = require("../../utils/localization");
const pagination_1 = require("../../utils/pagination");
const stock_1 = require("../../utils/stock");
function toNumber(value) {
    return Number(new client_1.Prisma.Decimal(value ?? 0).toString());
}
function toRoundedPrice(value) {
    return Math.round(toNumber(value));
}
function buildTranslationMap(translations) {
    return translations.reduce((accumulator, translation) => {
        const languageKey = translation.language.toLowerCase();
        accumulator[languageKey] = {
            name: translation.name ?? null,
            description: translation.description ?? null,
        };
        return accumulator;
    }, {});
}
async function getMarketplaceOrganization(organizationId, options = {}) {
    const organization = await prisma_1.prisma.organization.findFirst({
        where: {
            id: organizationId,
            deletedAt: null,
        },
        select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            currencyCode: true,
            defaultLanguage: true,
            branches: {
                where: {
                    deletedAt: null,
                },
                orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
                select: {
                    id: true,
                    code: true,
                    name: true,
                    type: true,
                    city: true,
                    isActive: true,
                },
            },
        },
    });
    if (!organization || organization.status !== "ACTIVE") {
        throw ApiError_1.ApiError.notFound("Active organization not found");
    }
    return {
        organization,
        localeContext: (0, localization_1.createLocaleContext)({
            requestedLanguage: options.requestedLanguage ?? null,
            orgDefaultLanguage: organization.defaultLanguage,
        }),
    };
}
async function getMarketplaceBranch(organizationId, branchId, localeContext) {
    const branch = await prisma_1.prisma.branch.findFirst({
        where: {
            id: branchId,
            organizationId,
            deletedAt: null,
            isActive: true,
        },
    });
    if (!branch) {
        throw ApiError_1.ApiError.notFound("Active branch not found for this organization");
    }
    return (0, localization_1.serializeLocalizedEntity)(branch, localeContext);
}
function buildMarketplaceProductInclude(branchId) {
    return {
        category: {
            include: {
                translations: {
                    orderBy: {
                        language: "asc",
                    },
                },
            },
        },
        brand: {
            include: {
                translations: {
                    orderBy: {
                        language: "asc",
                    },
                },
            },
        },
        primaryUnit: {
            include: {
                translations: {
                    orderBy: {
                        language: "asc",
                    },
                },
            },
        },
        translations: {
            orderBy: {
                language: "asc",
            },
        },
        variants: {
            where: {
                deletedAt: null,
                isActive: true,
            },
            include: {
                translations: {
                    orderBy: {
                        language: "asc",
                    },
                },
                unit: {
                    include: {
                        translations: {
                            orderBy: {
                                language: "asc",
                            },
                        },
                    },
                },
                balances: {
                    where: {
                        branchId,
                    },
                    select: {
                        onHand: true,
                        reserved: true,
                    },
                },
            },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        },
    };
}
async function getMarketplaceProductRecord(organizationId, branchId, productId) {
    const product = await prisma_1.prisma.product.findFirst({
        where: {
            id: productId,
            organizationId,
            deletedAt: null,
            status: client_1.ProductStatus.ACTIVE,
        },
        include: buildMarketplaceProductInclude(branchId),
    });
    if (!product) {
        throw ApiError_1.ApiError.notFound("Active product not found");
    }
    return product;
}
function getDefaultVariant(product) {
    return product.variants.find((variant) => variant.isDefault) ?? product.variants[0] ?? null;
}
function resolveVariantStockSummary(variant) {
    const balance = variant.balances[0] ?? null;
    const onHand = balance?.onHand ?? 0;
    const reserved = balance?.reserved ?? 0;
    const available = (0, stock_1.getAvailableStock)(onHand, reserved);
    const availableQty = Math.max(0, Math.floor(toNumber(available)));
    const lowStock = availableQty > 0 && (0, stock_1.isLowStock)(onHand, variant.reorderLevel, variant.minStockLevel);
    return {
        availableQty,
        stockStatus: availableQty <= 0 ? "OUT_OF_STOCK" : lowStock ? "LOW_STOCK" : "IN_STOCK",
        isAvailable: availableQty > 0,
    };
}
function serializeMarketplaceVariant(variant, localeContext) {
    const localizedVariant = (0, localization_1.serializeLocalizedEntity)(variant, localeContext);
    const localizedUnit = variant.unit ? (0, localization_1.serializeLocalizedEntity)(variant.unit, localeContext) : null;
    const stock = resolveVariantStockSummary(variant);
    return {
        id: variant.id,
        sku: variant.sku,
        barcode: variant.barcode,
        name: localizedVariant.displayName ?? variant.name,
        imageUrl: variant.imageUrl,
        price: toRoundedPrice(variant.sellingPrice),
        mrp: variant.mrp ? toRoundedPrice(variant.mrp) : null,
        unitLabel: localizedUnit?.displayName ??
            localizedUnit?.symbol ??
            localizedUnit?.name ??
            null,
        isDefault: variant.isDefault,
        translations: buildTranslationMap(variant.translations),
        stock,
    };
}
function serializeMarketplaceProduct(product, localeContext) {
    const localizedProduct = (0, localization_1.serializeLocalizedEntity)(product, localeContext);
    const localizedCategory = product.category
        ? (0, localization_1.serializeLocalizedEntity)(product.category, localeContext)
        : null;
    const localizedBrand = product.brand
        ? (0, localization_1.serializeLocalizedEntity)(product.brand, localeContext)
        : null;
    const localizedPrimaryUnit = product.primaryUnit
        ? (0, localization_1.serializeLocalizedEntity)(product.primaryUnit, localeContext)
        : null;
    const defaultVariant = getDefaultVariant(product);
    const serializedVariants = product.variants.map((variant) => serializeMarketplaceVariant(variant, localeContext));
    const primaryVariant = defaultVariant
        ? serializedVariants.find((variant) => variant.id === defaultVariant.id) ?? null
        : null;
    if (!primaryVariant) {
        return null;
    }
    return {
        id: product.id,
        slug: product.slug,
        name: localizedProduct.displayName ?? product.name,
        description: localizedProduct.displayDescription ?? product.description ?? null,
        imageUrl: primaryVariant.imageUrl ?? product.imageUrl ?? null,
        price: primaryVariant.price,
        mrp: primaryVariant.mrp,
        stockStatus: primaryVariant.stock.stockStatus,
        availableQty: primaryVariant.stock.availableQty,
        isAvailable: primaryVariant.stock.isAvailable,
        category: localizedCategory
            ? {
                id: localizedCategory.id,
                slug: localizedCategory.slug,
                name: localizedCategory.displayName ?? localizedCategory.name,
            }
            : null,
        brand: localizedBrand
            ? {
                id: localizedBrand.id,
                slug: localizedBrand.slug,
                name: localizedBrand.displayName ?? localizedBrand.name,
            }
            : null,
        unitLabel: primaryVariant.unitLabel ??
            localizedPrimaryUnit?.displayName ??
            localizedPrimaryUnit?.symbol ??
            localizedPrimaryUnit?.name ??
            null,
        hasVariants: product.hasVariants,
        variantCount: serializedVariants.length,
        primaryVariantId: primaryVariant.id,
        translations: buildTranslationMap(product.translations),
        variants: serializedVariants,
    };
}
function applyCatalogSort(items, sort) {
    const normalized = items.filter((item) => Boolean(item));
    switch (sort) {
        case "name-asc":
            return normalized.sort((left, right) => left.name.localeCompare(right.name));
        case "price-asc":
            return normalized.sort((left, right) => left.price - right.price);
        case "price-desc":
            return normalized.sort((left, right) => right.price - left.price);
        case "newest":
            return normalized;
        case "featured":
        default:
            return normalized.sort((left, right) => {
                if (left.isAvailable !== right.isAvailable) {
                    return Number(right.isAvailable) - Number(left.isAvailable);
                }
                if (left.stockStatus !== right.stockStatus) {
                    return left.stockStatus.localeCompare(right.stockStatus);
                }
                return left.name.localeCompare(right.name);
            });
    }
}
async function listMarketplaceOrganizations(query) {
    const organizations = await prisma_1.prisma.organization.findMany({
        where: {
            deletedAt: null,
            status: "ACTIVE",
            ...(query.search
                ? {
                    OR: [
                        { name: { contains: query.search, mode: "insensitive" } },
                        { slug: { contains: query.search, mode: "insensitive" } },
                    ],
                }
                : {}),
        },
        select: {
            id: true,
            name: true,
            slug: true,
            currencyCode: true,
            status: true,
            branches: {
                where: {
                    deletedAt: null,
                },
                orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
                select: {
                    id: true,
                    code: true,
                    name: true,
                    type: true,
                    city: true,
                    isActive: true,
                },
            },
        },
        orderBy: {
            name: "asc",
        },
    });
    return {
        items: organizations.map((organization) => ({
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            currencyCode: organization.currencyCode,
            status: organization.status,
            branches: organization.branches.map((branch) => ({
                id: branch.id,
                code: branch.code,
                name: branch.name,
                type: branch.type,
                city: branch.city,
                isActive: branch.isActive,
            })),
        })),
    };
}
async function listMarketplaceCatalog(organizationId, query, options = {}) {
    const { organization, localeContext } = await getMarketplaceOrganization(organizationId, options);
    const branch = await getMarketplaceBranch(organizationId, query.branchId, localeContext);
    const include = buildMarketplaceProductInclude(query.branchId);
    const products = await prisma_1.prisma.product.findMany({
        where: {
            organizationId,
            deletedAt: null,
            status: client_1.ProductStatus.ACTIVE,
            ...(query.search
                ? {
                    OR: [
                        { name: { contains: query.search, mode: "insensitive" } },
                        { slug: { contains: query.search, mode: "insensitive" } },
                        {
                            translations: {
                                some: {
                                    name: {
                                        contains: query.search,
                                        mode: "insensitive",
                                    },
                                },
                            },
                        },
                    ],
                }
                : {}),
            ...(query.category
                ? {
                    OR: [
                        { categoryId: query.category },
                        { category: { slug: query.category } },
                    ],
                }
                : {}),
            ...(query.brand
                ? {
                    OR: [{ brandId: query.brand }, { brand: { slug: query.brand } }],
                }
                : {}),
        },
        include,
        orderBy: query.sort === "newest"
            ? {
                createdAt: "desc",
            }
            : {
                name: "asc",
            },
    });
    const serializedProducts = applyCatalogSort(products.map((product) => serializeMarketplaceProduct(product, localeContext)), query.sort).filter((product) => !query.inStockOnly || product.isAvailable);
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const paginatedItems = serializedProducts.slice(skip, skip + limit);
    return {
        items: paginatedItems,
        pagination: (0, pagination_1.buildPagination)(page, limit, serializedProducts.length),
        filters: {
            categories: await listMarketplaceCategories(organizationId, options),
            brands: await listMarketplaceBrands(organizationId, options),
        },
        shopInventory: {
            organization: {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                currencyCode: organization.currencyCode,
            },
            branch,
        },
    };
}
async function getMarketplaceCatalogProduct(organizationId, branchId, productId, options = {}) {
    const { organization, localeContext } = await getMarketplaceOrganization(organizationId, options);
    const branch = await getMarketplaceBranch(organizationId, branchId, localeContext);
    const product = await getMarketplaceProductRecord(organizationId, branchId, productId);
    const serializedProduct = serializeMarketplaceProduct(product, localeContext);
    if (!serializedProduct) {
        throw ApiError_1.ApiError.notFound("Active product not found");
    }
    return {
        item: serializedProduct,
        shopInventory: {
            organization: {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                currencyCode: organization.currencyCode,
            },
            branch,
        },
    };
}
async function checkMarketplaceAvailability(organizationId, input, options = {}) {
    const { organization, localeContext } = await getMarketplaceOrganization(organizationId, options);
    const branch = await getMarketplaceBranch(organizationId, input.branchId, localeContext);
    const productIds = Array.from(new Set(input.items.map((item) => item.productId)));
    const products = await prisma_1.prisma.product.findMany({
        where: {
            organizationId,
            id: {
                in: productIds,
            },
            deletedAt: null,
            status: client_1.ProductStatus.ACTIVE,
        },
        include: buildMarketplaceProductInclude(input.branchId),
    });
    const productMap = new Map(products.map((product) => [product.id, product]));
    const items = input.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
            return {
                productId: item.productId,
                variantId: item.variantId ?? null,
                requestedQuantity: item.quantity,
                quantityAccepted: 0,
                availableQuantity: 0,
                price: null,
                mrp: null,
                stockStatus: "OUT_OF_STOCK",
                status: "NOT_FOUND",
                reason: "Product no longer exists in the mapped catalog",
            };
        }
        const resolvedVariant = (item.variantId
            ? product.variants.find((variant) => variant.id === item.variantId)
            : null) ?? getDefaultVariant(product);
        if (!resolvedVariant) {
            return {
                productId: item.productId,
                variantId: item.variantId ?? null,
                requestedQuantity: item.quantity,
                quantityAccepted: 0,
                availableQuantity: 0,
                price: null,
                mrp: null,
                stockStatus: "OUT_OF_STOCK",
                status: "NOT_FOUND",
                reason: "Product is missing an active sellable variant",
            };
        }
        const serializedProduct = serializeMarketplaceProduct(product, localeContext);
        const serializedVariant = serializeMarketplaceVariant(resolvedVariant, localeContext);
        const availableQuantity = serializedVariant.stock.availableQty;
        const quantityAccepted = Math.min(item.quantity, availableQuantity);
        const status = availableQuantity <= 0
            ? "OUT_OF_STOCK"
            : quantityAccepted < item.quantity
                ? "INSUFFICIENT_STOCK"
                : "VALID";
        return {
            productId: product.id,
            variantId: resolvedVariant.id,
            requestedQuantity: item.quantity,
            quantityAccepted,
            availableQuantity,
            price: serializedVariant.price,
            mrp: serializedVariant.mrp,
            stockStatus: serializedVariant.stock.stockStatus,
            status,
            reason: status === "OUT_OF_STOCK"
                ? "Item is currently out of stock"
                : status === "INSUFFICIENT_STOCK"
                    ? "Requested quantity exceeds current stock"
                    : null,
            product: serializedProduct,
        };
    });
    return {
        items,
        summary: {
            validCount: items.filter((item) => item.status === "VALID").length,
            invalidCount: items.filter((item) => item.status !== "VALID").length,
        },
        shopInventory: {
            organization: {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                currencyCode: organization.currencyCode,
            },
            branch,
        },
    };
}
async function listMarketplaceCategories(organizationId, options = {}) {
    const { localeContext } = await getMarketplaceOrganization(organizationId, options);
    const categories = await prisma_1.prisma.category.findMany({
        where: {
            organizationId,
            deletedAt: null,
            isActive: true,
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
    return categories.map((category) => {
        const localizedCategory = (0, localization_1.serializeLocalizedEntity)(category, localeContext);
        return {
            id: category.id,
            slug: category.slug,
            name: localizedCategory.displayName ?? category.name,
            translations: buildTranslationMap(category.translations),
        };
    });
}
async function listMarketplaceBrands(organizationId, options = {}) {
    const { localeContext } = await getMarketplaceOrganization(organizationId, options);
    const brands = await prisma_1.prisma.brand.findMany({
        where: {
            organizationId,
            deletedAt: null,
            isActive: true,
        },
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
        orderBy: {
            name: "asc",
        },
    });
    return brands.map((brand) => {
        const localizedBrand = (0, localization_1.serializeLocalizedEntity)(brand, localeContext);
        return {
            id: brand.id,
            slug: brand.slug,
            name: localizedBrand.displayName ?? brand.name,
            translations: buildTranslationMap(brand.translations),
        };
    });
}
