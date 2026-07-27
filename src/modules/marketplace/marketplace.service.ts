import { AuditAction, LanguageCode, OrderSource, ProductStatus, Prisma, SalesOrderStatus } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { assertBranchInOrg, assertOrganizationExists } from "../../utils/guards";
import { toDecimal } from "../../utils/decimal";
import { toNullableJsonValue } from "../../utils/json";
import {
  createLocaleContext,
  type LocaleContext,
  serializeLocalizedEntity,
} from "../../utils/localization";
import { generateDocumentNumber } from "../../utils/numbering";
import { buildPagination, getPagination } from "../../utils/pagination";
import { getAvailableStock, isLowStock } from "../../utils/stock";
import { createAuditLog } from "../audit/audit.service";
import { cancelSalesOrder } from "../sales-orders/sales-orders.service";
import { sendPushToOrgStaff } from "../../services/push-notification.service";

type RequestedLocaleOptions = {
  requestedLanguage?: LanguageCode | null;
};

type MarketplaceProductRecord = Awaited<ReturnType<typeof getMarketplaceProductRecord>>;

function toNumber(value: Prisma.Decimal.Value | null | undefined) {
  return Number(new Prisma.Decimal(value ?? 0).toString());
}

function toRoundedPrice(value: Prisma.Decimal.Value | null | undefined) {
  return Math.round(toNumber(value));
}

function buildTranslationMap<
  TTranslation extends {
    language: LanguageCode;
    name?: string | null;
    description?: string | null;
  },
>(translations: TTranslation[]) {
  return translations.reduce<
    Partial<Record<Lowercase<LanguageCode>, { name: string | null; description: string | null }>>
  >((accumulator, translation) => {
    const languageKey = translation.language.toLowerCase() as Lowercase<LanguageCode>;

    accumulator[languageKey] = {
      name: translation.name ?? null,
      description: translation.description ?? null,
    };

    return accumulator;
  }, {});
}

async function getMarketplaceOrganization(
  organizationId: string,
  options: RequestedLocaleOptions = {},
) {
  const organization = await prisma.organization.findFirst({
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
    throw ApiError.notFound("Active organization not found");
  }

  return {
    organization,
    localeContext: createLocaleContext({
      requestedLanguage: options.requestedLanguage ?? null,
      orgDefaultLanguage: organization.defaultLanguage,
    }),
  };
}

async function getMarketplaceBranch(
  organizationId: string,
  branchId: string,
  localeContext: LocaleContext,
) {
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      organizationId,
      deletedAt: null,
      isActive: true,
    },
  });

  if (!branch) {
    throw ApiError.notFound("Active branch not found for this organization");
  }

  return serializeLocalizedEntity(branch, localeContext);
}

function buildMarketplaceProductInclude(branchId: string) {
  return {
    category: {
      include: {
        translations: {
          orderBy: {
            language: "asc" as const,
          },
        },
      },
    },
    brand: {
      include: {
        translations: {
          orderBy: {
            language: "asc" as const,
          },
        },
      },
    },
    primaryUnit: {
      include: {
        translations: {
          orderBy: {
            language: "asc" as const,
          },
        },
      },
    },
    translations: {
      orderBy: {
        language: "asc" as const,
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
            language: "asc" as const,
          },
        },
        unit: {
          include: {
            translations: {
              orderBy: {
                language: "asc" as const,
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
      orderBy: [{ isDefault: "desc" as const }, { createdAt: "asc" as const }],
    },
  } satisfies Prisma.ProductInclude;
}

async function getMarketplaceProductRecord(
  organizationId: string,
  branchId: string,
  productId: string,
) {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      organizationId,
      deletedAt: null,
      status: ProductStatus.ACTIVE,
    },
    include: buildMarketplaceProductInclude(branchId),
  });

  if (!product) {
    throw ApiError.notFound("Active product not found");
  }

  return product;
}

function getDefaultVariant(product: MarketplaceProductRecord) {
  return product.variants.find((variant) => variant.isDefault) ?? product.variants[0] ?? null;
}

function resolveVariantStockSummary(
  variant: NonNullable<MarketplaceProductRecord["variants"][number]>,
) {
  const balance = variant.balances[0] ?? null;
  const onHand = balance?.onHand ?? 0;
  const reserved = balance?.reserved ?? 0;
  const available = getAvailableStock(onHand, reserved);
  const availableQty = Math.max(0, Math.floor(toNumber(available)));
  const lowStock = availableQty > 0 && isLowStock(onHand, variant.reorderLevel, variant.minStockLevel);

  return {
    availableQty,
    stockStatus:
      availableQty <= 0 ? "OUT_OF_STOCK" : lowStock ? "LOW_STOCK" : "IN_STOCK",
    isAvailable: availableQty > 0,
  };
}

function serializeMarketplaceVariant(
  variant: MarketplaceProductRecord["variants"][number],
  localeContext: LocaleContext,
) {
  const localizedVariant = serializeLocalizedEntity(variant, localeContext);
  const localizedUnit = variant.unit ? serializeLocalizedEntity(variant.unit, localeContext) : null;
  const stock = resolveVariantStockSummary(variant);

  return {
    id: variant.id,
    sku: variant.sku,
    barcode: variant.barcode,
    name: localizedVariant.displayName ?? variant.name,
    imageUrl: variant.imageUrl,
    price: toRoundedPrice(variant.sellingPrice),
    mrp: variant.mrp ? toRoundedPrice(variant.mrp) : null,
    unitLabel:
      localizedUnit?.displayName ??
      localizedUnit?.symbol ??
      localizedUnit?.name ??
      null,
    isDefault: variant.isDefault,
    translations: buildTranslationMap(variant.translations),
    stock,
  };
}

function serializeMarketplaceProduct(
  product: MarketplaceProductRecord,
  localeContext: LocaleContext,
) {
  const localizedProduct = serializeLocalizedEntity(product, localeContext);
  const localizedCategory = product.category
    ? serializeLocalizedEntity(product.category, localeContext)
    : null;
  const localizedBrand = product.brand
    ? serializeLocalizedEntity(product.brand, localeContext)
    : null;
  const localizedPrimaryUnit = product.primaryUnit
    ? serializeLocalizedEntity(product.primaryUnit, localeContext)
    : null;
  const defaultVariant = getDefaultVariant(product);
  const serializedVariants = product.variants.map((variant) =>
    serializeMarketplaceVariant(variant, localeContext),
  );
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
    unitLabel:
      primaryVariant.unitLabel ??
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

function applyCatalogSort(
  items: Array<ReturnType<typeof serializeMarketplaceProduct>>,
  sort: "featured" | "name-asc" | "price-asc" | "price-desc" | "newest",
) {
  const normalized = items.filter(
    (item): item is NonNullable<typeof item> => Boolean(item),
  );

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

export async function listMarketplaceOrganizations(query: { search?: string }) {
  const organizations = await prisma.organization.findMany({
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

export async function listMarketplaceCatalog(
  organizationId: string,
  query: {
    branchId: string;
    page: number;
    limit: number;
    search?: string;
    category?: string;
    brand?: string;
    inStockOnly?: boolean;
    sort: "featured" | "name-asc" | "price-asc" | "price-desc" | "newest";
  },
  options: RequestedLocaleOptions = {},
) {
  const { organization, localeContext } = await getMarketplaceOrganization(organizationId, options);
  const branch = await getMarketplaceBranch(organizationId, query.branchId, localeContext);
  const include = buildMarketplaceProductInclude(query.branchId);

  const products = await prisma.product.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: ProductStatus.ACTIVE,
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
    orderBy:
      query.sort === "newest"
        ? {
            createdAt: "desc",
          }
        : {
            name: "asc",
          },
  });

  const serializedProducts = applyCatalogSort(
    products.map((product) => serializeMarketplaceProduct(product, localeContext)),
    query.sort,
  ).filter((product) => !query.inStockOnly || product.isAvailable);

  const { page, limit, skip } = getPagination(query.page, query.limit);
  const paginatedItems = serializedProducts.slice(skip, skip + limit);

  return {
    items: paginatedItems,
    pagination: buildPagination(page, limit, serializedProducts.length),
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

export async function getMarketplaceCatalogProduct(
  organizationId: string,
  branchId: string,
  productId: string,
  options: RequestedLocaleOptions = {},
) {
  const { organization, localeContext } = await getMarketplaceOrganization(organizationId, options);
  const branch = await getMarketplaceBranch(organizationId, branchId, localeContext);
  const product = await getMarketplaceProductRecord(organizationId, branchId, productId);
  const serializedProduct = serializeMarketplaceProduct(product, localeContext);

  if (!serializedProduct) {
    throw ApiError.notFound("Active product not found");
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

export async function checkMarketplaceAvailability(
  organizationId: string,
  input: {
    branchId: string;
    items: Array<{
      productId: string;
      variantId?: string | null;
      quantity: number;
    }>;
  },
  options: RequestedLocaleOptions = {},
) {
  const { organization, localeContext } = await getMarketplaceOrganization(organizationId, options);
  const branch = await getMarketplaceBranch(organizationId, input.branchId, localeContext);
  const productIds = Array.from(new Set(input.items.map((item) => item.productId)));
  const products = await prisma.product.findMany({
    where: {
      organizationId,
      id: {
        in: productIds,
      },
      deletedAt: null,
      status: ProductStatus.ACTIVE,
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

    const resolvedVariant =
      (item.variantId
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
    const status =
      availableQuantity <= 0
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
      reason:
        status === "OUT_OF_STOCK"
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

export async function listMarketplaceCategories(
  organizationId: string,
  options: RequestedLocaleOptions = {},
) {
  const { localeContext } = await getMarketplaceOrganization(organizationId, options);
  const categories = await prisma.category.findMany({
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
    const localizedCategory = serializeLocalizedEntity(category, localeContext);

    return {
      id: category.id,
      slug: category.slug,
      name: localizedCategory.displayName ?? category.name,
      translations: buildTranslationMap(category.translations),
    };
  });
}

export async function listMarketplaceBrands(
  organizationId: string,
  options: RequestedLocaleOptions = {},
) {
  const { localeContext } = await getMarketplaceOrganization(organizationId, options);
  const brands = await prisma.brand.findMany({
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
    const localizedBrand = serializeLocalizedEntity(brand, localeContext);

    return {
      id: brand.id,
      slug: brand.slug,
      name: localizedBrand.displayName ?? brand.name,
      translations: buildTranslationMap(brand.translations),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Bridge write-back: NearCart pushes a customer order in as a SalesOrder (source=APP) here, and
// reads its status back. This is the only part of the marketplace bridge that writes — everything
// above this point is read-only. See marketplace.route.ts header comment for contract notes.
// ---------------------------------------------------------------------------------------------

interface CreateBridgedSalesOrderInput {
  branchId: string;
  externalOrderId: string;
  externalOrderNumber?: string;
  customer: {
    name: string;
    phone: string;
    addressLine?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  items: Array<{
    inventoryProductId: string;
    inventoryVariantId: string | null;
    quantity: string | number;
    unitPrice: string | number;
  }>;
  notes?: string | null;
}

function summarizeSalesOrder(order: {
  id: string;
  orderNumber: string;
  status: SalesOrderStatus;
  rejectionReason: string | null;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
}) {
  return {
    salesOrderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    rejectionReason: order.rejectionReason ?? undefined,
    confirmedAt: order.confirmedAt?.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString(),
  };
}

async function findOrCreateBridgeCustomer(
  organizationId: string,
  customerInput: CreateBridgedSalesOrderInput["customer"],
) {
  const existing = await prisma.customer.findFirst({
    where: {
      organizationId,
      phone: customerInput.phone,
      deletedAt: null,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.customer.create({
    data: {
      organizationId,
      name: customerInput.name,
      phone: customerInput.phone,
      address:
        customerInput.addressLine || customerInput.latitude || customerInput.longitude
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
export async function createBridgedSalesOrder(
  organizationId: string,
  input: CreateBridgedSalesOrderInput,
) {
  await assertOrganizationExists(prisma, organizationId);
  const branch = await assertBranchInOrg(prisma, organizationId, input.branchId);

  // assertBranchInOrg only checks org membership + not-deleted (it's shared with
  // purchases/stock-transfers/sales-orders, where staff may deliberately write against a
  // temporarily-inactive branch). Every *read* endpoint in this file requires isActive, so the
  // write path should too — otherwise a deactivated branch could still receive bridged orders.
  if (!branch.isActive) {
    throw ApiError.badRequest("This branch is not currently accepting orders");
  }

  const existing = await prisma.salesOrder.findUnique({
    where: { externalOrderId: input.externalOrderId },
  });

  if (existing) {
    if (existing.organizationId !== organizationId) {
      throw ApiError.conflict("This externalOrderId has already been bridged to a different organization");
    }

    return { ...summarizeSalesOrder(existing), created: false as const };
  }

  const customer = await findOrCreateBridgeCustomer(organizationId, input.customer);

  let subtotal = toDecimal(0);
  const preparedItems: Array<{
    productId: string;
    variantId: string;
    productNameSnapshot: string;
    variantNameSnapshot: string;
    skuSnapshot: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    taxRate: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }> = [];

  for (const item of input.items) {
    // `inventoryVariantId` is nullable: NearCart sends null for cart items that were validated
    // without pinning a specific variant. Fall back to the product's default (or first active)
    // variant rather than requiring an exact id match in that case.
    const variant = item.inventoryVariantId
      ? await prisma.productVariant.findFirst({
          where: {
            id: item.inventoryVariantId,
            organizationId,
            deletedAt: null,
            product: { deletedAt: null },
          },
          include: { product: true },
        })
      : await prisma.productVariant.findFirst({
          where: {
            productId: item.inventoryProductId,
            organizationId,
            deletedAt: null,
            product: { deletedAt: null },
          },
          include: { product: true },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        });

    if (
      !variant ||
      variant.productId !== item.inventoryProductId ||
      (item.inventoryVariantId && variant.id !== item.inventoryVariantId)
    ) {
      throw ApiError.badRequest(
        `Product/variant ${item.inventoryProductId}/${item.inventoryVariantId ?? "(default)"} was not found in this organization's catalog`,
      );
    }

    const quantity = toDecimal(item.quantity);
    const unitPrice = toDecimal(item.unitPrice);

    if (quantity.lessThanOrEqualTo(0)) {
      throw ApiError.badRequest("Sales quantities must be positive");
    }

    if (unitPrice.isNegative()) {
      throw ApiError.badRequest("Unit price cannot be negative");
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
      taxRate: toDecimal(0),
      taxAmount: toDecimal(0),
      discountAmount: toDecimal(0),
      lineTotal,
    });
  }

  // Structured per-order delivery address (SalesOrder.deliveryAddress, Json?) — kept separate
  // from Customer.address since a returning customer may order to a different address each
  // time. Previously this was appended as free text onto `notes` (see git history); notes is now
  // reserved for actual free-text notes only, populated straight from input.notes.
  const deliveryAddress =
    input.customer.addressLine || input.customer.latitude != null || input.customer.longitude != null
      ? {
          addressLine: input.customer.addressLine ?? null,
          latitude: input.customer.latitude ?? null,
          longitude: input.customer.longitude ?? null,
        }
      : null;
  const notes = input.notes ?? null;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.create({
        data: {
          organizationId,
          branchId: input.branchId,
          customerId: customer.id,
          orderNumber: generateDocumentNumber("SO"),
          source: OrderSource.APP,
          status: SalesOrderStatus.PENDING,
          externalOrderId: input.externalOrderId,
          externalOrderNumber: input.externalOrderNumber ?? null,
          notes,
          // Bridged orders are the real-world path a customer order actually takes, so this is
          // the deadline that matters for the order-confirmation-sweep cron in practice — the
          // staff-facing createSalesOrder path sets the same field for consistency, but the
          // sweep's WHERE clause only ever matches PENDING rows, which is what this always starts
          // as (see status above).
          confirmationDeadlineAt: new Date(Date.now() + env.ORDER_CONFIRMATION_TIMEOUT_MINUTES * 60_000),
          deliveryAddress: toNullableJsonValue(deliveryAddress),
          subtotal,
          taxTotal: toDecimal(0),
          discountTotal: toDecimal(0),
          total: subtotal,
          items: {
            createMany: {
              data: preparedItems,
            },
          },
        },
      });

      await createAuditLog(tx, {
        organizationId,
        action: AuditAction.CREATE,
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
    void sendPushToOrgStaff(organizationId, {
      title: "New order received",
      body: `Order #${created.orderNumber} — ${preparedItems.length} item(s), ${created.total.toString()} total.`,
      data: { salesOrderId: created.id },
      channelId: "order_alert",
    });

    return { ...summarizeSalesOrder(created), created: true as const };
  } catch (error) {
    // Idempotency race: two concurrent replays of the same externalOrderId. The unique
    // constraint on externalOrderId is the source of truth — re-fetch and return it instead of
    // surfacing a 500/409 for what is, from NearCart's point of view, a successful retry.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raceWinner = await prisma.salesOrder.findUnique({
        where: { externalOrderId: input.externalOrderId },
      });

      if (raceWinner) {
        return { ...summarizeSalesOrder(raceWinner), created: false as const };
      }
    }

    throw error;
  }
}

export async function getSalesOrderByExternalId(externalOrderId: string) {
  const order = await prisma.salesOrder.findUnique({
    where: { externalOrderId },
  });

  if (!order) {
    throw ApiError.notFound("No sales order found for this externalOrderId");
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
export async function cancelBridgedSalesOrder(organizationId: string, externalOrderId: string) {
  const order = await prisma.salesOrder.findUnique({
    where: { externalOrderId },
  });

  if (!order || order.organizationId !== organizationId) {
    throw ApiError.notFound("No sales order found for this externalOrderId in this organization");
  }

  let cancelled;
  try {
    cancelled = await cancelSalesOrder(order.organizationId, order.id, null);
  } catch (error) {
    // cancelSalesOrder throws ApiError.badRequest (400) for its two "already closed" /
    // "delivered or returned" guards — appropriate for a staff UI showing a form validation-style
    // error, but not for this bridge endpoint, which the contract specifies should respond 409 on
    // a blocked cancel (a state conflict, not a malformed request). Remap here rather than
    // touching cancelSalesOrder's own status codes, since that would also change the
    // staff-facing /:id/cancel endpoint's behavior.
    if (error instanceof ApiError && error.statusCode === 400) {
      throw ApiError.conflict(error.message);
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
const INACTIVE_ORDER_STATUSES: SalesOrderStatus[] = [
  SalesOrderStatus.DELIVERED,
  SalesOrderStatus.CANCELLED,
  SalesOrderStatus.REJECTED,
  SalesOrderStatus.RETURNED,
];

export async function getBranchActiveOrderCount(organizationId: string, branchId: string) {
  await assertOrganizationExists(prisma, organizationId);
  await assertBranchInOrg(prisma, organizationId, branchId);

  const activeOrderCount = await prisma.salesOrder.count({
    where: {
      organizationId,
      branchId,
      status: { notIn: INACTIVE_ORDER_STATUSES },
    },
  });

  return { activeOrderCount };
}
