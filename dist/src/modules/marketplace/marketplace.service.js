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
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const env_1 = require("../../config/env");
const ApiError_1 = require("../../utils/ApiError");
const guards_1 = require("../../utils/guards");
const decimal_1 = require("../../utils/decimal");
const json_1 = require("../../utils/json");
const localization_1 = require("../../utils/localization");
const numbering_1 = require("../../utils/numbering");
const pagination_1 = require("../../utils/pagination");
const stock_1 = require("../../utils/stock");
const audit_service_1 = require("../audit/audit.service");
const sales_orders_service_1 = require("../sales-orders/sales-orders.service");
const push_notification_service_1 = require("../../services/push-notification.service");
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
                        { name: { contains: query.search } },
                        { slug: { contains: query.search } },
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
                        { name: { contains: query.search } },
                        { slug: { contains: query.search } },
                        {
                            translations: {
                                some: {
                                    name: {
                                        contains: query.search,
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
function summarizeSalesOrder(order) {
    return {
        salesOrderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        rejectionReason: order.rejectionReason ?? undefined,
        confirmedAt: order.confirmedAt?.toISOString(),
        deliveredAt: order.deliveredAt?.toISOString(),
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
    for (const item of input.items) {
        // `inventoryVariantId` is nullable: NearCart sends null for cart items that were validated
        // without pinning a specific variant. Fall back to the product's default (or first active)
        // variant rather than requiring an exact id match in that case.
        const variant = item.inventoryVariantId
            ? await prisma_1.prisma.productVariant.findFirst({
                where: {
                    id: item.inventoryVariantId,
                    organizationId,
                    deletedAt: null,
                    product: { deletedAt: null },
                },
                include: { product: true },
            })
            : await prisma_1.prisma.productVariant.findFirst({
                where: {
                    productId: item.inventoryProductId,
                    organizationId,
                    deletedAt: null,
                    product: { deletedAt: null },
                },
                include: { product: true },
                orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            });
        if (!variant ||
            variant.productId !== item.inventoryProductId ||
            (item.inventoryVariantId && variant.id !== item.inventoryVariantId)) {
            throw ApiError_1.ApiError.badRequest(`Product/variant ${item.inventoryProductId}/${item.inventoryVariantId ?? "(default)"} was not found in this organization's catalog`);
        }
        const quantity = (0, decimal_1.toDecimal)(item.quantity);
        const unitPrice = (0, decimal_1.toDecimal)(item.unitPrice);
        if (quantity.lessThanOrEqualTo(0)) {
            throw ApiError_1.ApiError.badRequest("Sales quantities must be positive");
        }
        if (unitPrice.isNegative()) {
            throw ApiError_1.ApiError.badRequest("Unit price cannot be negative");
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
    const deliveryAddress = input.customer.addressLine || input.customer.latitude != null || input.customer.longitude != null
        ? {
            addressLine: input.customer.addressLine ?? null,
            latitude: input.customer.latitude ?? null,
            longitude: input.customer.longitude ?? null,
        }
        : null;
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
        void (0, push_notification_service_1.sendPushToOrgStaff)(organizationId, {
            title: "New order received",
            body: `Order #${created.orderNumber} — ${preparedItems.length} item(s), ${created.total.toString()} total.`,
            data: { salesOrderId: created.id },
            channelId: "order_alert",
        }).catch((error) => {
            console.warn(`[marketplace] Failed to notify org staff of new order ${created.id}`, error);
        });
        return { ...summarizeSalesOrder(created), created: true };
    }
    catch (error) {
        // Idempotency race: two concurrent replays of the same externalOrderId. The unique
        // constraint on externalOrderId is the source of truth — re-fetch and return it instead of
        // surfacing a 500/409 for what is, from NearCart's point of view, a successful retry.
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const raceWinner = await prisma_1.prisma.salesOrder.findUnique({
                where: { externalOrderId: input.externalOrderId },
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
        cancelled = await (0, sales_orders_service_1.cancelSalesOrder)(order.organizationId, order.id, null);
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
