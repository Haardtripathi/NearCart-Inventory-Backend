"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMarketplaceOrganizations = listMarketplaceOrganizations;
exports.listMarketplaceCatalog = listMarketplaceCatalog;
exports.getMarketplaceCatalogProduct = getMarketplaceCatalogProduct;
exports.checkMarketplaceAvailability = checkMarketplaceAvailability;
exports.listMarketplaceCategories = listMarketplaceCategories;
exports.listMarketplaceBrands = listMarketplaceBrands;
exports.createBridgedSalesOrder = createBridgedSalesOrder;
exports.getSalesOrderByExternalId = getSalesOrderByExternalId;
exports.cancelBridgedSalesOrder = cancelBridgedSalesOrder;
exports.getBranchActiveOrderCount = getBranchActiveOrderCount;
exports.respondToPartialFulfilment = respondToPartialFulfilment;
exports.sendShopOpenReminder = sendShopOpenReminder;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const env_1 = require("../../config/env");
const ApiError_1 = require("../../utils/ApiError");
const guards_1 = require("../../utils/guards");
const decimal_1 = require("../../utils/decimal");
const json_1 = require("../../utils/json");
const orderPayment_1 = require("../../utils/orderPayment");
const partialFulfilment_1 = require("../../utils/partialFulfilment");
const localization_1 = require("../../utils/localization");
const numbering_1 = require("../../utils/numbering");
const pagination_1 = require("../../utils/pagination");
const stock_1 = require("../../utils/stock");
const prismaErrors_1 = require("../../utils/prismaErrors");
const audit_service_1 = require("../audit/audit.service");
const sales_orders_service_1 = require("../sales-orders/sales-orders.service");
const sales_orders_service_2 = require("../sales-orders/sales-orders.service");
const notifications_service_1 = require("../notifications/notifications.service");
const push_notification_service_1 = require("../../services/push-notification.service");
const marketplace_catalog_query_1 = require("./marketplace-catalog.query");
const marketplace_metadata_cache_1 = require("./marketplace-metadata.cache");
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
            // The branch list that used to be selected here was never read by any caller of this
            // helper — every one of them resolves the single branch it was asked about via
            // getMarketplaceBranch, and only listMarketplaceOrganizations (which has its own query)
            // returns branches. As a nested relation it cost a second remote round trip on the front
            // of every catalog, product, availability, categories and brands request: 78ms of the
            // ~250ms budget, measured, for data that was thrown away.
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
/**
 * Loads the products matching `productWhere`, with the variants, translations and live branch
 * stock the marketplace response needs.
 *
 * WHY THIS IS FIVE FLAT QUERIES AND NOT ONE NESTED `select`:
 *
 * Prisma resolves a nested selection one relation LEVEL at a time, and every level is a separate
 * round trip to the remote Turso database. The nested version of this read was
 * Product -> (translations, variants) -> (variant translations, balances): three sequential levels,
 * 149ms measured for eight products, and the second and third levels could not start until the one
 * above them came back.
 *
 * Expressing each leaf as its own query with a RELATION FILTER (`{ product: productWhere }`) means
 * the database, not this process, resolves which rows belong to the page — so all five go out at
 * once and the whole read costs one round trip's latency instead of three. Nothing is fetched that
 * the nested form did not fetch; the rows are just stitched back together here.
 *
 * Category, brand and unit are deliberately absent: they are slow-changing display metadata served
 * from the cached per-organization snapshot (marketplace-metadata.cache.ts). Stock is deliberately
 * present: `balances` is read live, on every request, and is never cached anywhere.
 */
async function hydrateMarketplaceProducts(productWhere, branchId) {
    const activeVariantWhere = {
        product: productWhere,
        deletedAt: null,
        isActive: true,
    };
    const [products, productTranslations, variants, variantTranslations, balances] = await Promise.all([
        prisma_1.prisma.product.findMany({
            where: productWhere,
            select: {
                id: true,
                slug: true,
                name: true,
                description: true,
                imageUrl: true,
                hasVariants: true,
                categoryId: true,
                brandId: true,
                primaryUnitId: true,
            },
        }),
        prisma_1.prisma.productTranslation.findMany({
            where: { product: productWhere },
            select: { productId: true, language: true, name: true, description: true },
            orderBy: { language: "asc" },
        }),
        prisma_1.prisma.productVariant.findMany({
            where: activeVariantWhere,
            select: {
                id: true,
                productId: true,
                sku: true,
                barcode: true,
                name: true,
                imageUrl: true,
                sellingPrice: true,
                mrp: true,
                reorderLevel: true,
                minStockLevel: true,
                isDefault: true,
                unitId: true,
            },
            // Same ordering the nested `variants` selection used, so getDefaultVariant still picks the
            // flagged default and otherwise the oldest active variant.
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        }),
        prisma_1.prisma.productVariantTranslation.findMany({
            where: { variant: activeVariantWhere },
            select: { variantId: true, language: true, name: true },
            orderBy: { language: "asc" },
        }),
        prisma_1.prisma.inventoryBalance.findMany({
            where: { branchId, variant: activeVariantWhere },
            select: { variantId: true, onHand: true, reserved: true },
        }),
    ]);
    const translationsByProductId = new Map();
    for (const translation of productTranslations) {
        const bucket = translationsByProductId.get(translation.productId);
        const entry = {
            language: translation.language,
            name: translation.name,
            description: translation.description,
        };
        if (bucket) {
            bucket.push(entry);
        }
        else {
            translationsByProductId.set(translation.productId, [entry]);
        }
    }
    const translationsByVariantId = new Map();
    for (const translation of variantTranslations) {
        const bucket = translationsByVariantId.get(translation.variantId);
        const entry = { language: translation.language, name: translation.name };
        if (bucket) {
            bucket.push(entry);
        }
        else {
            translationsByVariantId.set(translation.variantId, [entry]);
        }
    }
    // At most one balance row per variant+branch (InventoryBalance is unique on
    // organizationId+branchId+variantId), but it stays an array so resolveVariantStockSummary's
    // `balances[0] ?? null` — and its "no row means zero stock" behaviour — is unchanged.
    const balancesByVariantId = new Map();
    for (const balance of balances) {
        const bucket = balancesByVariantId.get(balance.variantId);
        const entry = { onHand: balance.onHand, reserved: balance.reserved };
        if (bucket) {
            bucket.push(entry);
        }
        else {
            balancesByVariantId.set(balance.variantId, [entry]);
        }
    }
    const variantsByProductId = new Map();
    for (const variant of variants) {
        const entry = {
            id: variant.id,
            sku: variant.sku,
            barcode: variant.barcode,
            name: variant.name,
            imageUrl: variant.imageUrl,
            sellingPrice: variant.sellingPrice,
            mrp: variant.mrp,
            reorderLevel: variant.reorderLevel,
            minStockLevel: variant.minStockLevel,
            isDefault: variant.isDefault,
            unitId: variant.unitId,
            translations: translationsByVariantId.get(variant.id) ?? [],
            balances: balancesByVariantId.get(variant.id) ?? [],
        };
        const bucket = variantsByProductId.get(variant.productId);
        if (bucket) {
            bucket.push(entry);
        }
        else {
            variantsByProductId.set(variant.productId, [entry]);
        }
    }
    return products.map((product) => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        hasVariants: product.hasVariants,
        categoryId: product.categoryId,
        brandId: product.brandId,
        primaryUnitId: product.primaryUnitId,
        translations: translationsByProductId.get(product.id) ?? [],
        variants: variantsByProductId.get(product.id) ?? [],
    }));
}
/** Category/brand/unit ids a hydrated product page actually references, for the cache backstop. */
function collectMetadataReferences(products) {
    const categoryIds = new Set();
    const brandIds = new Set();
    const unitIds = new Set();
    for (const product of products) {
        if (product.categoryId) {
            categoryIds.add(product.categoryId);
        }
        if (product.brandId) {
            brandIds.add(product.brandId);
        }
        if (product.primaryUnitId) {
            unitIds.add(product.primaryUnitId);
        }
        for (const variant of product.variants) {
            if (variant.unitId) {
                unitIds.add(variant.unitId);
            }
        }
    }
    return { categoryIds, brandIds, unitIds };
}
/**
 * Loads the cached catalog metadata and guarantees it covers every id these products reference.
 * Callers that already have the metadata in hand (the catalog listing fetches it in parallel with
 * the candidate query) pass it in instead of loading it twice.
 */
async function resolveMetadataFor(organizationId, products, preloaded) {
    const metadata = preloaded ?? (await (0, marketplace_metadata_cache_1.getOrgCatalogMetadata)(organizationId));
    await (0, marketplace_metadata_cache_1.ensureCatalogMetadataCoverage)(metadata, collectMetadataReferences(products));
    return metadata;
}
async function getMarketplaceProductRecord(organizationId, branchId, productId) {
    const [product] = await hydrateMarketplaceProducts({
        id: productId,
        organizationId,
        deletedAt: null,
        status: client_1.ProductStatus.ACTIVE,
    }, branchId);
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
function serializeMarketplaceVariant(variant, localeContext, metadata) {
    const localizedVariant = (0, localization_1.serializeLocalizedEntity)(variant, localeContext);
    const unit = variant.unitId ? metadata.unitById.get(variant.unitId) ?? null : null;
    const localizedUnit = unit ? (0, localization_1.serializeLocalizedEntity)(unit, localeContext) : null;
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
function serializeMarketplaceProduct(product, localeContext, metadata) {
    const localizedProduct = (0, localization_1.serializeLocalizedEntity)(product, localeContext);
    const category = product.categoryId ? metadata.categoryById.get(product.categoryId) ?? null : null;
    const brand = product.brandId ? metadata.brandById.get(product.brandId) ?? null : null;
    const primaryUnit = product.primaryUnitId ? metadata.unitById.get(product.primaryUnitId) ?? null : null;
    const localizedCategory = category ? (0, localization_1.serializeLocalizedEntity)(category, localeContext) : null;
    const localizedBrand = brand ? (0, localization_1.serializeLocalizedEntity)(brand, localeContext) : null;
    const localizedPrimaryUnit = primaryUnit ? (0, localization_1.serializeLocalizedEntity)(primaryUnit, localeContext) : null;
    const defaultVariant = getDefaultVariant(product);
    const serializedVariants = product.variants.map((variant) => serializeMarketplaceVariant(variant, localeContext, metadata));
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
// The shop directory is read on every customer app open and fans out from NearCart's public
// endpoints, but it only changes when a shop is onboarded, renamed, deactivated or gains a
// branch. 60s of staleness is invisible to a shopper and cannot produce a bad order: the write
// path re-checks the branch's isActive itself before accepting anything (see
// createBridgedSalesOrder), so a branch that went inactive in the last minute still refuses the
// order even if it is briefly still listed here.
const ORGANIZATIONS_CACHE_TTL_SECONDS = 60;
const ORGANIZATIONS_CACHE_KEY = "mp-organizations:v1";
function isMarketplaceOrganizationsResult(value) {
    return typeof value === "object" && value !== null && Array.isArray(value.items);
}
async function listMarketplaceOrganizations(query) {
    // Only the unfiltered directory is cached. A `search` term is deliberately read through to the
    // database rather than filtered in JS over a cached list, because Prisma's `contains` compiles
    // to SQL LIKE and matching that exactly in JavaScript (case folding, non-ASCII) is the kind of
    // near-miss that quietly changes which shops a customer can find.
    if (query.search) {
        return loadMarketplaceOrganizations(query.search);
    }
    return (0, marketplace_metadata_cache_1.readThroughJsonCache)(ORGANIZATIONS_CACHE_KEY, ORGANIZATIONS_CACHE_TTL_SECONDS, isMarketplaceOrganizationsResult, () => loadMarketplaceOrganizations(undefined));
}
async function loadMarketplaceOrganizations(search) {
    const organizations = await prisma_1.prisma.organization.findMany({
        where: {
            deletedAt: null,
            status: "ACTIVE",
            ...(search
                ? {
                    OR: [
                        { name: { contains: search } },
                        { slug: { contains: search } },
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
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    // Independent of each other and each a separate remote round trip, so they go out together
    // rather than one after another — this endpoint's cost is round-trip latency, not row count.
    // The candidate query resolves filter + sort + page + total in the database (see
    // marketplace-catalog.query.ts) instead of loading the whole catalog and slicing it in JS.
    const [branch, candidates, preloadedMetadata] = await Promise.all([
        getMarketplaceBranch(organizationId, query.branchId, localeContext),
        (0, marketplace_catalog_query_1.selectCatalogCandidates)(organizationId, query, localeContext, { skip, take: limit }),
        (0, marketplace_metadata_cache_1.getOrgCatalogMetadata)(organizationId),
    ]);
    // Only the ids on this page get the full per-product read, so the hydrate cost is bounded by
    // `limit` rather than by how many products the shop sells.
    const products = candidates.productIds.length
        ? await hydrateMarketplaceProducts({ id: { in: candidates.productIds } }, query.branchId)
        : [];
    const metadata = await resolveMetadataFor(organizationId, products, preloadedMetadata);
    const productById = new Map(products.map((product) => [product.id, product]));
    // `findMany` with an `in` filter has no ordering guarantee, so the page is rebuilt in the order
    // the candidate query decided on.
    const items = candidates.productIds
        .map((productId) => productById.get(productId))
        .filter((product) => Boolean(product))
        .map((product) => serializeMarketplaceProduct(product, localeContext, metadata))
        .filter((product) => Boolean(product));
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, candidates.totalItems),
        filters: {
            // Served from the same cached snapshot as the product rows above — previously these were two
            // more awaited calls that each re-fetched the organization and then its categories/brands,
            // eight further round trips on every catalog page view.
            categories: serializeCatalogCategories(metadata, localeContext),
            brands: serializeCatalogBrands(metadata, localeContext),
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
    const [branch, product] = await Promise.all([
        getMarketplaceBranch(organizationId, branchId, localeContext),
        getMarketplaceProductRecord(organizationId, branchId, productId),
    ]);
    const metadata = await resolveMetadataFor(organizationId, [product]);
    const serializedProduct = serializeMarketplaceProduct(product, localeContext, metadata);
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
    const productIds = Array.from(new Set(input.items.map((item) => item.productId)));
    const [branch, products, preloadedMetadata] = await Promise.all([
        getMarketplaceBranch(organizationId, input.branchId, localeContext),
        hydrateMarketplaceProducts({
            organizationId,
            id: {
                in: productIds,
            },
            deletedAt: null,
            status: client_1.ProductStatus.ACTIVE,
        }, input.branchId),
        (0, marketplace_metadata_cache_1.getOrgCatalogMetadata)(organizationId),
    ]);
    const metadata = await resolveMetadataFor(organizationId, products, preloadedMetadata);
    const productMap = new Map(products.map((product) => [product.id, product]));
    // A cart can list the same product twice (two variants of it); serializing the product once per
    // distinct id keeps that from redoing the same localization work per line.
    const serializedProductCache = new Map();
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
        let serializedProduct = serializedProductCache.get(product.id);
        if (serializedProduct === undefined) {
            serializedProduct = serializeMarketplaceProduct(product, localeContext, metadata);
            serializedProductCache.set(product.id, serializedProduct);
        }
        const serializedVariant = serializeMarketplaceVariant(resolvedVariant, localeContext, metadata);
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
/**
 * The customer-visible category filter list, derived from the cached snapshot. The snapshot holds
 * every category (a product may reference a deactivated one — see the cache module), so the
 * active/not-deleted filter and the sortOrder-then-name ordering that the database used to apply
 * are reproduced here instead.
 */
function serializeCatalogCategories(metadata, localeContext) {
    return metadata.metadata.categories
        .filter((category) => category.isActive && !category.isDeleted)
        .map((category) => {
        const localizedCategory = (0, localization_1.serializeLocalizedEntity)(category, localeContext);
        return {
            id: category.id,
            slug: category.slug,
            name: localizedCategory.displayName ?? category.name,
            translations: buildTranslationMap(category.translations),
        };
    });
}
function serializeCatalogBrands(metadata, localeContext) {
    return metadata.metadata.brands
        .filter((brand) => brand.isActive && !brand.isDeleted)
        .map((brand) => {
        const localizedBrand = (0, localization_1.serializeLocalizedEntity)(brand, localeContext);
        return {
            id: brand.id,
            slug: brand.slug,
            name: localizedBrand.displayName ?? brand.name,
            translations: buildTranslationMap(brand.translations),
        };
    });
}
async function listMarketplaceCategories(organizationId, options = {}) {
    const [{ localeContext }, metadata] = await Promise.all([
        getMarketplaceOrganization(organizationId, options),
        (0, marketplace_metadata_cache_1.getOrgCatalogMetadata)(organizationId),
    ]);
    return serializeCatalogCategories(metadata, localeContext);
}
async function listMarketplaceBrands(organizationId, options = {}) {
    const [{ localeContext }, metadata] = await Promise.all([
        getMarketplaceOrganization(organizationId, options),
        (0, marketplace_metadata_cache_1.getOrgCatalogMetadata)(organizationId),
    ]);
    return serializeCatalogBrands(metadata, localeContext);
}
function summarizeSalesOrder(order) {
    return {
        salesOrderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        rejectionReason: order.rejectionReason ?? undefined,
        confirmedAt: order.confirmedAt?.toISOString(),
        deliveredAt: order.deliveredAt?.toISOString(),
        deliveryProofPhotoUrl: order.deliveryProofPhotoUrl ?? undefined,
        assignedDriver: order.assignedDriver === undefined
            ? undefined
            : order.assignedDriver
                ? {
                    fullName: order.assignedDriver.fullName,
                    phone: order.assignedDriver.phone,
                    vehicleType: order.assignedDriver.vehicleType,
                }
                : null,
        driverAssignedAt: order.assignedAt?.toISOString(),
        // `null` (not `undefined`) when there is no proposal: NearCart treats a missing key as "this
        // bridge deployment is too old to know about partial fulfilment" and an explicit null as
        // "there is genuinely nothing to review", which are meaningfully different on its side.
        partialFulfilment: (0, partialFulfilment_1.parsePartialFulfilment)(order.deliveryAddress),
    };
}
async function findOrCreateBridgeCustomer(organizationId, customerInput) {
    const existing = await prisma_1.prisma.customer.findFirst({
        where: {
            organizationId,
            phone: customerInput.phone,
            deletedAt: null,
        },
    });
    if (existing) {
        return existing;
    }
    return prisma_1.prisma.customer.create({
        data: {
            organizationId,
            name: customerInput.name,
            phone: customerInput.phone,
            address: customerInput.addressLine || customerInput.latitude || customerInput.longitude
                ? {
                    addressLine: customerInput.addressLine ?? null,
                    latitude: customerInput.latitude ?? null,
                    longitude: customerInput.longitude ?? null,
                }
                : undefined,
        },
    });
}
/**
 * Creates a SalesOrder (source=APP) from a NearCart customer order, or — if externalOrderId has
 * already been bridged before — returns the existing SalesOrder untouched. Callers should return
 * HTTP 201 on `created: true` and 200 otherwise, per the documented bridge contract.
 */
async function createBridgedSalesOrder(organizationId, input) {
    await (0, guards_1.assertOrganizationExists)(prisma_1.prisma, organizationId);
    const branch = await (0, guards_1.assertBranchInOrg)(prisma_1.prisma, organizationId, input.branchId);
    // assertBranchInOrg only checks org membership + not-deleted (it's shared with
    // purchases/stock-transfers/sales-orders, where staff may deliberately write against a
    // temporarily-inactive branch). Every *read* endpoint in this file requires isActive, so the
    // write path should too — otherwise a deactivated branch could still receive bridged orders.
    if (!branch.isActive) {
        throw ApiError_1.ApiError.badRequest("This branch is not currently accepting orders");
    }
    const existing = await prisma_1.prisma.salesOrder.findUnique({
        where: { externalOrderId: input.externalOrderId },
        include: { assignedDriver: { select: { fullName: true, phone: true, vehicleType: true } } },
    });
    if (existing) {
        if (existing.organizationId !== organizationId) {
            throw ApiError_1.ApiError.conflict("This externalOrderId has already been bridged to a different organization");
        }
        return { ...summarizeSalesOrder(existing), created: false };
    }
    const customer = await findOrCreateBridgeCustomer(organizationId, input.customer);
    let subtotal = (0, decimal_1.toDecimal)(0);
    const preparedItems = [];
    // Every variant this order needs, in ONE query. This used to be a `findFirst` per line item
    // inside the loop below — a textbook N+1, and an expensive one here because each of those is a
    // separate round trip to a remote database: a 20-line order paid 20 sequential round trips
    // before it could even open its write transaction. Ordered so the first row for a product is
    // the one the old per-item default lookup would have picked.
    const orderProductIds = Array.from(new Set(input.items.map((item) => item.inventoryProductId)));
    const orderVariants = await prisma_1.prisma.productVariant.findMany({
        where: {
            productId: { in: orderProductIds },
            organizationId,
            deletedAt: null,
            product: { deletedAt: null },
        },
        select: {
            id: true,
            productId: true,
            name: true,
            sku: true,
            sellingPrice: true,
            product: { select: { name: true } },
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    const orderVariantById = new Map(orderVariants.map((variant) => [variant.id, variant]));
    const defaultVariantByProductId = new Map();
    for (const variant of orderVariants) {
        if (!defaultVariantByProductId.has(variant.productId)) {
            defaultVariantByProductId.set(variant.productId, variant);
        }
    }
    for (const item of input.items) {
        // `inventoryVariantId` is nullable: NearCart sends null for cart items that were validated
        // without pinning a specific variant. Fall back to the product's default (or first active)
        // variant rather than requiring an exact id match in that case.
        const variant = item.inventoryVariantId
            ? orderVariantById.get(item.inventoryVariantId) ?? null
            : defaultVariantByProductId.get(item.inventoryProductId) ?? null;
        if (!variant ||
            variant.productId !== item.inventoryProductId ||
            (item.inventoryVariantId && variant.id !== item.inventoryVariantId)) {
            throw ApiError_1.ApiError.badRequest(`Product/variant ${item.inventoryProductId}/${item.inventoryVariantId ?? "(default)"} was not found in this organization's catalog`);
        }
        const quantity = (0, decimal_1.toDecimal)(item.quantity);
        // Repriced server-side from this organization's own catalog rather than trusting
        // `item.unitPrice` as sent over the bridge. This is a service-to-service call authenticated
        // only by a shared secret, not a per-request signature — the price on it ultimately traces
        // back to whatever NearCart's cart/checkout had cached for this item, which is exactly the
        // kind of stale/manipulable value the sibling apps' own "price-drift" bug class has already
        // shown can go wrong on the NearCart side. Inventory owns the catalog, so it — not the
        // caller — must be the source of truth for what an item actually costs; accepting a
        // caller-supplied price here would let a stale or tampered cart under- (or over-) charge a
        // customer relative to the shop's real, current selling price. `item.unitPrice` is still
        // accepted on the request shape for backward compatibility and logged below when it disagrees
        // meaningfully with the real price, purely as a signal that NearCart's own cart snapshot may
        // be out of sync — it is never used to compute totals.
        const unitPrice = variant.sellingPrice;
        if (quantity.lessThanOrEqualTo(0)) {
            throw ApiError_1.ApiError.badRequest("Sales quantities must be positive");
        }
        const suppliedUnitPrice = (0, decimal_1.toDecimal)(item.unitPrice);
        if (!suppliedUnitPrice.equals(unitPrice)) {
            console.warn(`[marketplace] Bridged order item for variant ${variant.id} arrived with unitPrice ${suppliedUnitPrice.toString()} but the organization's current sellingPrice is ${unitPrice.toString()} — repricing server-side and ignoring the supplied value.`);
        }
        const lineTotal = quantity.mul(unitPrice);
        subtotal = subtotal.plus(lineTotal);
        preparedItems.push({
            productId: variant.productId,
            variantId: variant.id,
            productNameSnapshot: variant.product.name,
            variantNameSnapshot: variant.name,
            skuSnapshot: variant.sku,
            quantity,
            unitPrice,
            taxRate: (0, decimal_1.toDecimal)(0),
            taxAmount: (0, decimal_1.toDecimal)(0),
            discountAmount: (0, decimal_1.toDecimal)(0),
            lineTotal,
        });
    }
    // Structured per-order delivery address (SalesOrder.deliveryAddress, Json?) — kept separate
    // from Customer.address since a returning customer may order to a different address each
    // time. Previously this was appended as free text onto `notes` (see git history); notes is now
    // reserved for actual free-text notes only, populated straight from input.notes.
    //
    // Also carries the optional `payment` block (delivery fee, discount, payment method/status,
    // amount the customer actually owes) — `subtotal/total` below stay "goods value" only (stock/
    // sales analytics read them), so without this the driver app asked for the goods total instead
    // of what the customer owes. See utils/orderPayment.ts.
    const deliveryAddress = (0, orderPayment_1.buildBridgedDeliveryAddress)(input.customer, input.payment);
    // PAID only when NearCart says an ONLINE payment has actually been received; COD, pay-at-shop
    // and unconfirmed online payments all start UNPAID exactly as before.
    const paymentStatus = (0, orderPayment_1.isPrepaidOnline)(input.payment) ? client_1.PaymentStatus.PAID : client_1.PaymentStatus.UNPAID;
    const notes = input.notes ?? null;
    try {
        const created = await prisma_1.prisma.$transaction(async (tx) => {
            const order = await tx.salesOrder.create({
                data: {
                    organizationId,
                    branchId: input.branchId,
                    customerId: customer.id,
                    orderNumber: (0, numbering_1.generateDocumentNumber)("SO"),
                    source: client_1.OrderSource.APP,
                    status: client_1.SalesOrderStatus.PENDING,
                    externalOrderId: input.externalOrderId,
                    externalOrderNumber: input.externalOrderNumber ?? null,
                    notes,
                    // Bridged orders are the real-world path a customer order actually takes, so this is
                    // the deadline that matters for the order-confirmation-sweep cron in practice — the
                    // staff-facing createSalesOrder path sets the same field for consistency, but the
                    // sweep's WHERE clause only ever matches PENDING rows, which is what this always starts
                    // as (see status above).
                    confirmationDeadlineAt: new Date(Date.now() + env_1.env.ORDER_CONFIRMATION_TIMEOUT_MINUTES * 60_000),
                    deliveryAddress: (0, json_1.toNullableJsonValue)(deliveryAddress),
                    paymentStatus,
                    subtotal,
                    taxTotal: (0, decimal_1.toDecimal)(0),
                    discountTotal: (0, decimal_1.toDecimal)(0),
                    total: subtotal,
                    items: {
                        createMany: {
                            data: preparedItems,
                        },
                    },
                },
            });
            await (0, audit_service_1.createAuditLog)(tx, {
                organizationId,
                action: client_1.AuditAction.CREATE,
                entityType: "SalesOrder",
                entityId: order.id,
                after: order,
                meta: { source: "marketplace-bridge", externalOrderId: input.externalOrderId },
            });
            return order;
        });
        // New order placed -> notify every device belonging to a staff User with an active
        // membership on this org (fire-and-forget: a push failure must never fail order creation,
        // same resilience posture as notifyOrderEvent). Only on an actual new row — not on the
        // idempotent-replay paths above/below, which didn't create anything new to be notified about.
        // `sendPushToOrgStaff` only wraps the actual Expo API call in a try/catch internally — its
        // leading `organizationMembership`/`deviceToken` lookups are not guarded, so a transient DB
        // error there would otherwise become an unhandled promise rejection on this fire-and-forget
        // call and crash the process (same bug class documented elsewhere this session).
        const pushTitle = "New order received";
        // When NearCart sent the customer's bill, quote what the customer actually pays + how (the
        // goods-only `total` next to nothing else is what made a 434 COD order read as "360").
        const paymentMethodLabel = { COD: "cash on delivery", ONLINE: "online payment", PAY_ON_PICKUP: "pay at shop" };
        const pushBody = input.payment?.amountPayable != null && input.payment.method
            ? `Order #${created.orderNumber} — ${preparedItems.length} item(s), customer pays ${input.payment.amountPayable} (${paymentMethodLabel[input.payment.method]}).`
            : `Order #${created.orderNumber} — ${preparedItems.length} item(s), ${created.total.toString()} total.`;
        const pushData = { salesOrderId: created.id };
        void (0, push_notification_service_1.sendPushToOrgStaff)(organizationId, {
            title: pushTitle,
            body: pushBody,
            data: pushData,
            channelId: "order_alert",
        }).catch((error) => {
            console.warn(`[marketplace] Failed to notify org staff of new order ${created.id}`, error);
        });
        // Persisted alongside the push above so the mobile app's alerts-history screen has something
        // to show beyond a transient OS notification — see notifications.service.ts. Runs after the
        // creating transaction has already committed (this whole block is outside the
        // prisma.$transaction above), so this uses the plain `prisma` client, not a tx — and is
        // fire-and-forget for the same reason as the push it accompanies: a failure here must never
        // fail order creation, which has already succeeded by this point regardless.
        void (0, notifications_service_1.recordNotificationLog)(prisma_1.prisma, {
            organizationId,
            type: client_1.NotificationLogType.NEW_ORDER,
            title: pushTitle,
            body: pushBody,
            data: pushData,
        }).catch((error) => {
            console.warn(`[marketplace] Failed to record new-order notification log for order ${created.id}`, error);
        });
        return { ...summarizeSalesOrder(created), created: true };
    }
    catch (error) {
        // Idempotency race: two concurrent replays of the same externalOrderId. The unique
        // constraint on externalOrderId is the source of truth — re-fetch and return it instead of
        // surfacing a 500/409 for what is, from NearCart's point of view, a successful retry. See
        // utils/prismaErrors.ts — can't compare `error.code === "P2002"` directly under this adapter
        // (it silently stopped matching after the Postgres -> Turso migration, which would have
        // turned every idempotent-retry push from NearCart into a hard failure instead of a replay).
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && (0, prismaErrors_1.isUniqueConstraintError)(error)) {
            const raceWinner = await prisma_1.prisma.salesOrder.findUnique({
                where: { externalOrderId: input.externalOrderId },
                include: { assignedDriver: { select: { fullName: true, phone: true, vehicleType: true } } },
            });
            if (raceWinner) {
                return { ...summarizeSalesOrder(raceWinner), created: false };
            }
        }
        throw error;
    }
}
async function getSalesOrderByExternalId(externalOrderId) {
    const order = await prisma_1.prisma.salesOrder.findUnique({
        where: { externalOrderId },
        include: { assignedDriver: { select: { fullName: true, phone: true, vehicleType: true } } },
    });
    if (!order) {
        throw ApiError_1.ApiError.notFound("No sales order found for this externalOrderId");
    }
    return summarizeSalesOrder(order);
}
/**
 * Cancels a bridged SalesOrder on behalf of a NearCart customer-app cancel, looked up by
 * externalOrderId (same lookup pattern as getSalesOrderByExternalId above). Routes through the
 * existing staff-facing cancelSalesOrder in sales-orders.service.ts rather than duplicating its
 * stock-reversal/audit logic — passing `actorUserId: null` since this is a service-to-service
 * call, not an authenticated staff user (see the doc comment on cancelSalesOrder itself for why
 * null rather than a fabricated actor id).
 */
async function cancelBridgedSalesOrder(organizationId, externalOrderId) {
    const order = await prisma_1.prisma.salesOrder.findUnique({
        where: { externalOrderId },
    });
    if (!order || order.organizationId !== organizationId) {
        throw ApiError_1.ApiError.notFound("No sales order found for this externalOrderId in this organization");
    }
    let cancelled;
    try {
        cancelled = await (0, sales_orders_service_2.cancelSalesOrder)(order.organizationId, order.id, null);
    }
    catch (error) {
        // cancelSalesOrder throws ApiError.badRequest (400) for its two "already closed" /
        // "delivered or returned" guards — appropriate for a staff UI showing a form validation-style
        // error, but not for this bridge endpoint, which the contract specifies should respond 409 on
        // a blocked cancel (a state conflict, not a malformed request). Remap here rather than
        // touching cancelSalesOrder's own status codes, since that would also change the
        // staff-facing /:id/cancel endpoint's behavior.
        if (error instanceof ApiError_1.ApiError && error.statusCode === 400) {
            throw ApiError_1.ApiError.conflict(error.message);
        }
        throw error;
    }
    return {
        salesOrderId: cancelled.id,
        orderNumber: cancelled.orderNumber,
        status: cancelled.status,
        // SalesOrder has no dedicated cancelledAt column — updatedAt is set by Prisma's @updatedAt
        // on the same update that flips status to CANCELLED, so it's an accurate stand-in here.
        cancelledAt: cancelled.updatedAt.toISOString(),
    };
}
/**
 * Count of "active" (not yet in a terminal state) SalesOrders for a branch — used by the
 * marketplace bridge as a queue-depth signal (e.g. NearCart showing "busy" status for a shop).
 * assertBranchInOrg both confirms the branch exists and belongs to this organization, and is the
 * same helper the rest of this module already uses for that check (404s if either is false).
 */
const INACTIVE_ORDER_STATUSES = [
    client_1.SalesOrderStatus.DELIVERED,
    client_1.SalesOrderStatus.CANCELLED,
    client_1.SalesOrderStatus.REJECTED,
    client_1.SalesOrderStatus.RETURNED,
];
async function getBranchActiveOrderCount(organizationId, branchId) {
    await (0, guards_1.assertOrganizationExists)(prisma_1.prisma, organizationId);
    await (0, guards_1.assertBranchInOrg)(prisma_1.prisma, organizationId, branchId);
    const activeOrderCount = await prisma_1.prisma.salesOrder.count({
        where: {
            organizationId,
            branchId,
            status: { notIn: INACTIVE_ORDER_STATUSES },
        },
    });
    return { activeOrderCount };
}
/**
 * The customer's answer to a shop's partial-fulfilment proposal, arriving over the bridge from
 * NearCart (which owns the customer relationship — see utils/partialFulfilment.ts for the whole
 * flow). Looked up by externalOrderId, org-scoped in the path like the cancel endpoint so the
 * caller confirms which organization it expects the order to belong to.
 *
 * IDEMPOTENT BY DESIGN: a retried/duplicated call (flaky network, an impatient double-tap) must
 * not confirm an order twice or cancel an already-confirmed one. If the proposal is no longer
 * AWAITING_CUSTOMER this returns the current state with `applied: false` and changes nothing —
 * a second POST is a successful no-op, not a 409, because from NearCart's point of view the
 * answer did land.
 */
async function respondToPartialFulfilment(organizationId, externalOrderId, input) {
    const order = await prisma_1.prisma.salesOrder.findUnique({ where: { externalOrderId } });
    if (!order || order.organizationId !== organizationId) {
        throw ApiError_1.ApiError.notFound("No sales order found for this externalOrderId in this organization");
    }
    const proposal = (0, partialFulfilment_1.parsePartialFulfilment)(order.deliveryAddress);
    if (!proposal) {
        throw ApiError_1.ApiError.conflict("This order has no revised order awaiting a response");
    }
    if (proposal.state !== "AWAITING_CUSTOMER") {
        const current = await prisma_1.prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id } });
        return {
            ...summarizeSalesOrder(current),
            applied: false,
        };
    }
    const updated = input.accepted
        ? await (0, sales_orders_service_1.acceptPartialFulfilment)(organizationId, order.id, input.revisedPayment)
        : await (0, sales_orders_service_1.declinePartialFulfilment)(organizationId, order.id);
    return {
        ...summarizeSalesOrder(updated),
        applied: true,
    };
}
/**
 * Nudges this organization's staff to confirm, in the Partner app, that the shop is open today.
 *
 * NearCart owns the "open today" flag (see modules/shop-status), and until it is confirmed each
 * day the storefront shows "Hours not confirmed yet" and every cart-validate/checkout for that
 * shop is rejected — so a shop owner who simply forgets gets zero orders and no explanation.
 * NearCart runs the daily sweep because it is the side that can find the unconfirmed shops in one
 * indexed query; it calls here because the staff device tokens live in THIS database.
 *
 * Deliberately takes no message body: the copy is fixed here so this endpoint can never be used
 * to push arbitrary text to a shop's staff. Fire-and-forget, like every other push in this repo —
 * a failed nudge must not fail the caller's sweep.
 */
async function sendShopOpenReminder(organizationId) {
    const organization = await prisma_1.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, status: true },
    });
    if (!organization || organization.status !== "ACTIVE") {
        throw ApiError_1.ApiError.notFound("No active organization found for this id");
    }
    void (0, push_notification_service_1.sendPushToOrgStaff)(organizationId, {
        title: "Confirm you're open today",
        body: "Customers can't order from you until you confirm today's opening hours in the Partner app.",
        data: { type: "SHOP_OPEN_REMINDER", organizationId },
        channelId: "order_alert",
    });
    return { organizationId, notified: true };
}
