import { LanguageCode, ProductStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import {
  createLocaleContext,
  type LocaleContext,
  serializeLocalizedEntity,
} from "../../utils/localization";
import { buildPagination, getPagination } from "../../utils/pagination";
import { getAvailableStock, isLowStock } from "../../utils/stock";

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
              { name: { contains: query.search, mode: "insensitive" as const } },
              { slug: { contains: query.search, mode: "insensitive" as const } },
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
              { name: { contains: query.search, mode: "insensitive" as const } },
              { slug: { contains: query.search, mode: "insensitive" as const } },
              {
                translations: {
                  some: {
                    name: {
                      contains: query.search,
                      mode: "insensitive" as const,
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
      variantId?: string;
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
