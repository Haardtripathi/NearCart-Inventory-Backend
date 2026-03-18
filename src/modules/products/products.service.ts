import {
  AuditAction,
  LanguageCode,
  Prisma,
  ProductSourceType,
  ProductStatus,
  ProductType,
  TrackMethod,
} from "@prisma/client";

import { prisma } from "../../config/prisma";
import { toDecimal } from "../../utils/decimal";
import { ApiError } from "../../utils/ApiError";
import {
  assertBrandInOrg,
  assertCategoryInOrg,
  assertIndustryExists,
  assertProductInOrg,
  assertTaxRateInOrg,
  assertUnitAvailable,
  assertVariantInOrg,
} from "../../utils/guards";
import type { LocaleContext } from "../../utils/localization";
import { serializeLocalizedEntity } from "../../utils/localization";
import { buildPagination, getPagination } from "../../utils/pagination";
import { slugify } from "../../utils/slug";
import { upsertTranslations } from "../../utils/translations";
import { toNullableJsonValue } from "../../utils/json";
import type { DbClient } from "../../types/prisma";
import { createAuditLog } from "../audit/audit.service";

interface ProductTranslationInput {
  language: LanguageCode;
  name: string;
  description?: string;
}

interface VariantTranslationInput {
  language: LanguageCode;
  name: string;
}

interface VariantInput {
  name?: string;
  sku: string;
  barcode?: string;
  attributes?: unknown;
  costPrice: Prisma.Decimal.Value;
  sellingPrice: Prisma.Decimal.Value;
  mrp?: Prisma.Decimal.Value;
  reorderLevel?: Prisma.Decimal.Value;
  minStockLevel?: Prisma.Decimal.Value;
  maxStockLevel?: Prisma.Decimal.Value;
  weight?: Prisma.Decimal.Value;
  unitId?: string;
  isDefault?: boolean;
  isActive?: boolean;
  imageUrl?: string;
  customFields?: unknown;
  metadata?: unknown;
  translations?: VariantTranslationInput[];
}

interface NormalizedVariantInput {
  name: string;
  sku: string;
  barcode: string | null;
  attributes: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined;
  costPrice: Prisma.Decimal;
  sellingPrice: Prisma.Decimal;
  mrp: Prisma.Decimal | null;
  reorderLevel: Prisma.Decimal;
  minStockLevel: Prisma.Decimal;
  maxStockLevel: Prisma.Decimal | null;
  weight: Prisma.Decimal | null;
  unitId: string | null;
  isDefault: boolean;
  isActive: boolean;
  imageUrl: string | null;
  customFields: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined;
  metadata: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined;
  translations: VariantTranslationInput[];
}

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
} satisfies Prisma.ProductInclude;

type ProductRecord = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

type ProductVariantRecord = ProductRecord["variants"][number];

function serializeVariant(variant: ProductVariantRecord, localeContext: LocaleContext) {
  return serializeLocalizedEntity(variant, localeContext);
}

function serializeProduct(product: ProductRecord, localeContext: LocaleContext) {
  const localizedProduct = serializeLocalizedEntity(product, localeContext);

  return {
    ...localizedProduct,
    category: product.category ? serializeLocalizedEntity(product.category, localeContext) : null,
    variants: product.variants.map((variant) => serializeVariant(variant, localeContext)),
  };
}

async function getProductRecordById(organizationId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      organizationId,
      deletedAt: null,
    },
    include: productInclude,
  });

  if (!product) {
    throw ApiError.notFound("Product not found");
  }

  return product;
}

async function validateProductReferences(
  organizationId: string,
  input: {
    categoryId?: string;
    brandId?: string;
    taxRateId?: string;
    industryId?: string;
    primaryUnitId?: string;
  },
) {
  if (input.categoryId) {
    await assertCategoryInOrg(prisma, organizationId, input.categoryId);
  }

  if (input.brandId) {
    await assertBrandInOrg(prisma, organizationId, input.brandId);
  }

  if (input.taxRateId) {
    await assertTaxRateInOrg(prisma, organizationId, input.taxRateId);
  }

  if (input.industryId) {
    await assertIndustryExists(prisma, input.industryId);
  }

  if (input.primaryUnitId) {
    await assertUnitAvailable(prisma, organizationId, input.primaryUnitId);
  }
}

async function validateVariantReferenceUnits(organizationId: string, variants: VariantInput[]) {
  for (const variant of variants) {
    if (variant.unitId) {
      await assertUnitAvailable(prisma, organizationId, variant.unitId);
    }
  }
}

function ensureRequestVariantUniqueness(variants: VariantInput[]) {
  const skuSet = new Set<string>();
  const barcodeSet = new Set<string>();

  for (const variant of variants) {
    const sku = variant.sku.trim();

    if (skuSet.has(sku)) {
      throw ApiError.badRequest("Duplicate SKU found in request payload");
    }

    skuSet.add(sku);

    if (variant.barcode) {
      const barcode = variant.barcode.trim();

      if (barcodeSet.has(barcode)) {
        throw ApiError.badRequest("Duplicate barcode found in request payload");
      }

      barcodeSet.add(barcode);
    }
  }
}

async function ensureVariantUniquenessInDb(
  organizationId: string,
  variants: VariantInput[],
  excludeVariantId?: string,
) {
  for (const variant of variants) {
    const existingSku = await prisma.productVariant.findFirst({
      where: {
        organizationId,
        sku: variant.sku.trim(),
        deletedAt: null,
        ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}),
      },
      select: { id: true },
    });

    if (existingSku) {
      throw ApiError.conflict(`SKU ${variant.sku.trim()} already exists`);
    }

    if (variant.barcode) {
      const existingBarcode = await prisma.productVariant.findFirst({
        where: {
          organizationId,
          barcode: variant.barcode.trim(),
          deletedAt: null,
          ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}),
        },
        select: { id: true },
      });

      if (existingBarcode) {
        throw ApiError.conflict(`Barcode ${variant.barcode.trim()} already exists`);
      }
    }
  }
}

function normalizeVariantPayload(
  productName: string,
  hasVariants: boolean,
  variants: VariantInput[],
): NormalizedVariantInput[] {
  let defaultIndex = variants.findIndex((variant) => variant.isDefault);

  if (defaultIndex < 0) {
    defaultIndex = 0;
  }

  return variants.map((variant, index) => ({
    name: variant.name?.trim() || (hasVariants ? `${productName.trim()} ${index + 1}` : productName.trim()),
    sku: variant.sku.trim(),
    barcode: variant.barcode?.trim() || null,
    attributes: toNullableJsonValue(variant.attributes),
    costPrice: toDecimal(variant.costPrice),
    sellingPrice: toDecimal(variant.sellingPrice),
    mrp: variant.mrp !== undefined ? toDecimal(variant.mrp) : null,
    reorderLevel: variant.reorderLevel !== undefined ? toDecimal(variant.reorderLevel) : new Prisma.Decimal(0),
    minStockLevel: variant.minStockLevel !== undefined ? toDecimal(variant.minStockLevel) : new Prisma.Decimal(0),
    maxStockLevel: variant.maxStockLevel !== undefined ? toDecimal(variant.maxStockLevel) : null,
    weight: variant.weight !== undefined ? toDecimal(variant.weight) : null,
    unitId: variant.unitId ?? null,
    isDefault: index === defaultIndex,
    isActive: variant.isActive ?? true,
    imageUrl: variant.imageUrl ?? null,
    customFields: toNullableJsonValue(variant.customFields),
    metadata: toNullableJsonValue(variant.metadata),
    translations: variant.translations ?? [],
  }));
}

async function upsertProductTranslations(
  db: DbClient,
  productId: string,
  translations: ProductTranslationInput[],
) {
  await upsertTranslations({
    entries: translations,
    listExisting: () =>
      db.productTranslation.findMany({
        where: {
          productId,
        },
        select: {
          id: true,
          language: true,
        },
      }),
    create: (translation) =>
      db.productTranslation.create({
        data: {
          productId,
          language: translation.language,
          name: translation.name.trim(),
          description: translation.description?.trim() ?? null,
        },
      }),
    update: (existing, translation) =>
      db.productTranslation.update({
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

async function upsertVariantTranslations(
  db: DbClient,
  variantId: string,
  translations: VariantTranslationInput[],
) {
  await upsertTranslations({
    entries: translations,
    listExisting: () =>
      db.productVariantTranslation.findMany({
        where: {
          variantId,
        },
        select: {
          id: true,
          language: true,
        },
      }),
    create: (translation) =>
      db.productVariantTranslation.create({
        data: {
          variantId,
          language: translation.language,
          name: translation.name.trim(),
        },
      }),
    update: (existing, translation) =>
      db.productVariantTranslation.update({
        where: {
          id: existing.id,
        },
        data: {
          name: translation.name.trim(),
        },
      }),
  });
}

async function createVariantRecord(
  db: DbClient,
  organizationId: string,
  productId: string,
  input: NormalizedVariantInput,
) {
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

export async function listProducts(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
    status?: ProductStatus;
    categoryId?: string;
    brandId?: string;
    hasVariants?: boolean;
  },
  localeContext: LocaleContext,
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
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
            { name: { contains: query.search, mode: "insensitive" as const } },
            { slug: { contains: query.search, mode: "insensitive" as const } },
            {
              translations: {
                some: {
                  name: { contains: query.search, mode: "insensitive" as const },
                },
              },
            },
            {
              variants: {
                some: {
                  deletedAt: null,
                  OR: [
                    { name: { contains: query.search, mode: "insensitive" as const } },
                    { sku: { contains: query.search, mode: "insensitive" as const } },
                    { barcode: { contains: query.search, mode: "insensitive" as const } },
                    {
                      translations: {
                        some: {
                          name: { contains: query.search, mode: "insensitive" as const },
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

  const [items, totalItems] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: items.map((item) => serializeProduct(item, localeContext)),
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createProduct(
  organizationId: string,
  actorUserId: string,
  input: {
    categoryId?: string;
    brandId?: string;
    taxRateId?: string;
    industryId?: string;
    name: string;
    slug?: string;
    description?: string;
    productType: ProductType;
    status?: ProductStatus;
    hasVariants?: boolean;
    trackInventory?: boolean;
    allowBackorder?: boolean;
    allowNegativeStock?: boolean;
    trackMethod?: TrackMethod;
    primaryUnitId?: string;
    imageUrl?: string;
    tags?: unknown;
    customFields?: unknown;
    metadata?: unknown;
    translations?: ProductTranslationInput[];
    defaultVariant?: VariantInput;
    variants?: VariantInput[];
  },
  localeContext: LocaleContext,
) {
  await validateProductReferences(organizationId, input);

  const computedHasVariants = input.productType === ProductType.VARIABLE || input.hasVariants === true;

  if (computedHasVariants && input.productType !== ProductType.VARIABLE) {
    throw ApiError.badRequest("Products with variants must use productType VARIABLE");
  }

  const rawVariants = (computedHasVariants
    ? input.variants ?? (input.defaultVariant ? [input.defaultVariant] : [])
    : input.defaultVariant
      ? [input.defaultVariant]
      : input.variants?.length
        ? [input.variants[0]]
        : []).filter((variant): variant is VariantInput => Boolean(variant));

  if (rawVariants.length === 0) {
    throw ApiError.badRequest(
      computedHasVariants
        ? "Variable products require at least one variant"
        : "Simple products require a default variant",
    );
  }

  if (!computedHasVariants && rawVariants.length > 1) {
    throw ApiError.badRequest("Simple products can only have one active default variant");
  }

  await validateVariantReferenceUnits(organizationId, rawVariants);
  ensureRequestVariantUniqueness(rawVariants);
  await ensureVariantUniquenessInDb(organizationId, rawVariants);

  const normalizedVariants = normalizeVariantPayload(input.name, computedHasVariants, rawVariants);
  const slug = slugify(input.slug ?? input.name);

  const productId = await prisma.$transaction(async (tx) => {
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
        sourceType: ProductSourceType.MANUAL,
        status: input.status ?? ProductStatus.ACTIVE,
        hasVariants: computedHasVariants,
        trackInventory: input.trackInventory ?? true,
        allowBackorder: input.allowBackorder ?? false,
        allowNegativeStock: input.allowNegativeStock ?? false,
        trackMethod: input.trackMethod ?? TrackMethod.PIECE,
        primaryUnitId: input.primaryUnitId ?? null,
        imageUrl: input.imageUrl ?? null,
        tags: toNullableJsonValue(input.tags),
        customFields: toNullableJsonValue(input.customFields),
        metadata: toNullableJsonValue(input.metadata),
        createdById: actorUserId,
        updatedById: actorUserId,
      },
    });

    await upsertProductTranslations(tx, product.id, input.translations ?? []);

    for (const variant of normalizedVariants) {
      await createVariantRecord(tx, organizationId, product.id, variant);
    }

    return product.id;
  });

  const product = await getProductRecordById(organizationId, productId);

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "Product",
    entityId: product.id,
    after: product,
  });

  return serializeProduct(product, localeContext);
}

export async function getProductById(
  organizationId: string,
  productId: string,
  localeContext: LocaleContext,
) {
  return serializeProduct(await getProductRecordById(organizationId, productId), localeContext);
}

export async function updateProduct(
  organizationId: string,
  productId: string,
  actorUserId: string,
  input: Partial<{
    categoryId: string;
    brandId: string;
    taxRateId: string;
    industryId: string;
    name: string;
    slug: string;
    description: string;
    productType: ProductType;
    status: ProductStatus;
    hasVariants: boolean;
    trackInventory: boolean;
    allowBackorder: boolean;
    allowNegativeStock: boolean;
    trackMethod: TrackMethod;
    primaryUnitId: string;
    imageUrl: string;
    tags: unknown;
    customFields: unknown;
    metadata: unknown;
    translations: ProductTranslationInput[];
  }>,
  localeContext: LocaleContext,
) {
  const existing = await getProductRecordById(organizationId, productId);
  await validateProductReferences(organizationId, input);

  const nextHasVariants = input.hasVariants ?? existing.hasVariants;
  const nextProductType = input.productType ?? existing.productType;

  if (nextHasVariants && nextProductType !== ProductType.VARIABLE) {
    throw ApiError.badRequest("Products with variants must use productType VARIABLE");
  }

  if (!nextHasVariants && existing.variants.length > 1) {
    throw ApiError.badRequest("Cannot convert a product with multiple variants into a simple product");
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId || null } : {}),
        ...(input.brandId !== undefined ? { brandId: input.brandId || null } : {}),
        ...(input.taxRateId !== undefined ? { taxRateId: input.taxRateId || null } : {}),
        ...(input.industryId !== undefined ? { industryId: input.industryId || null } : {}),
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.slug ? { slug: slugify(input.slug) } : {}),
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
        ...(input.tags !== undefined ? { tags: toNullableJsonValue(input.tags) } : {}),
        ...(input.customFields !== undefined ? { customFields: toNullableJsonValue(input.customFields) } : {}),
        ...(input.metadata !== undefined ? { metadata: toNullableJsonValue(input.metadata) } : {}),
        updatedById: actorUserId,
      },
    });

    await upsertProductTranslations(tx, productId, input.translations ?? []);
  });

  const updated = await getProductRecordById(organizationId, productId);

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "Product",
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return serializeProduct(updated, localeContext);
}

export async function deleteProduct(organizationId: string, productId: string, actorUserId: string) {
  const existing = await getProductRecordById(organizationId, productId);

  const deleted = await prisma.$transaction(async (tx) => {
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
        status: ProductStatus.ARCHIVED,
        deletedAt: new Date(),
        updatedById: actorUserId,
      },
    });
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.DELETE,
    entityType: "Product",
    entityId: deleted.id,
    before: existing,
    after: deleted,
  });

  return deleted;
}

export async function listVariants(
  organizationId: string,
  productId: string,
  localeContext: LocaleContext,
) {
  const product = await getProductRecordById(organizationId, productId);
  return product.variants.map((variant) => serializeVariant(variant, localeContext));
}

export async function createVariant(
  organizationId: string,
  productId: string,
  actorUserId: string,
  input: VariantInput,
  localeContext: LocaleContext,
) {
  const product = await getProductRecordById(organizationId, productId);

  if (product.status === ProductStatus.ARCHIVED) {
    throw ApiError.badRequest("Cannot create variant for archived product");
  }

  if (!product.hasVariants || product.productType !== ProductType.VARIABLE) {
    throw ApiError.badRequest("Variants can only be added to variable products");
  }

  await validateVariantReferenceUnits(organizationId, [input]);
  ensureRequestVariantUniqueness([input]);
  await ensureVariantUniquenessInDb(organizationId, [input]);

  const shouldBeDefault = input.isDefault ?? product.variants.every((variant) => !variant.isDefault);
  const normalized = normalizeVariantPayload(product.name, true, [{ ...input, isDefault: shouldBeDefault }])[0]!;

  const created = await prisma.$transaction(async (tx) => {
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

  const createdVariant = await prisma.productVariant.findUniqueOrThrow({
    where: { id: created.id },
    include: {
      translations: {
        orderBy: {
          language: "asc",
        },
      },
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "ProductVariant",
    entityId: created.id,
    after: createdVariant,
  });

  return serializeVariant(createdVariant as ProductVariantRecord, localeContext);
}

export async function updateVariant(
  organizationId: string,
  productId: string,
  variantId: string,
  actorUserId: string,
  input: Partial<VariantInput>,
  localeContext: LocaleContext,
) {
  const product = await getProductRecordById(organizationId, productId);
  const existing = await assertVariantInOrg(prisma, organizationId, variantId);

  if (existing.productId !== productId) {
    throw ApiError.badRequest("Variant does not belong to the selected product");
  }

  if (product.status === ProductStatus.ARCHIVED) {
    throw ApiError.badRequest("Cannot edit variants for archived product");
  }

  if (input.unitId) {
    await assertUnitAvailable(prisma, organizationId, input.unitId);
  }

  await ensureVariantUniquenessInDb(
    organizationId,
    [
      {
        sku: input.sku ?? existing.sku,
        barcode: input.barcode ?? existing.barcode ?? undefined,
        costPrice: input.costPrice ?? existing.costPrice,
        sellingPrice: input.sellingPrice ?? existing.sellingPrice,
      },
    ],
    variantId,
  );

  const shouldBeDefault = input.isDefault === true;

  const updated = await prisma.$transaction(async (tx) => {
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
      throw ApiError.badRequest("Simple products must keep one active default variant");
    }

    const variant = await tx.productVariant.update({
      where: { id: variantId },
      data: {
        ...(input.name !== undefined ? { name: input.name || product.name } : {}),
        ...(input.sku ? { sku: input.sku.trim() } : {}),
        ...(input.barcode !== undefined ? { barcode: input.barcode || null } : {}),
        ...(input.attributes !== undefined ? { attributes: toNullableJsonValue(input.attributes) } : {}),
        ...(input.costPrice !== undefined ? { costPrice: toDecimal(input.costPrice) } : {}),
        ...(input.sellingPrice !== undefined ? { sellingPrice: toDecimal(input.sellingPrice) } : {}),
        ...(input.mrp !== undefined ? { mrp: toDecimal(input.mrp) } : {}),
        ...(input.reorderLevel !== undefined ? { reorderLevel: toDecimal(input.reorderLevel) } : {}),
        ...(input.minStockLevel !== undefined ? { minStockLevel: toDecimal(input.minStockLevel) } : {}),
        ...(input.maxStockLevel !== undefined ? { maxStockLevel: toDecimal(input.maxStockLevel) } : {}),
        ...(input.weight !== undefined ? { weight: toDecimal(input.weight) } : {}),
        ...(input.unitId !== undefined
          ? input.unitId
            ? { unit: { connect: { id: input.unitId } } }
            : { unit: { disconnect: true } }
          : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl || null } : {}),
        ...(input.customFields !== undefined ? { customFields: toNullableJsonValue(input.customFields) } : {}),
        ...(input.metadata !== undefined ? { metadata: toNullableJsonValue(input.metadata) } : {}),
      },
    });

    await upsertVariantTranslations(tx, variantId, input.translations ?? []);

    return variant;
  });

  const updatedVariant = await prisma.productVariant.findUniqueOrThrow({
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

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "ProductVariant",
    entityId: updated.id,
    before: existing,
    after: updatedVariant,
  });

  return serializeVariant(updatedVariant as ProductVariantRecord, localeContext);
}

export async function deleteVariant(
  organizationId: string,
  productId: string,
  variantId: string,
  actorUserId: string,
) {
  const product = await getProductRecordById(organizationId, productId);
  const existing = await assertVariantInOrg(prisma, organizationId, variantId);

  if (existing.productId !== productId) {
    throw ApiError.badRequest("Variant does not belong to the selected product");
  }

  const activeVariants = product.variants;

  if (!product.hasVariants || activeVariants.length <= 1) {
    throw ApiError.badRequest("Simple products must keep exactly one active default variant");
  }

  const deleted = await prisma.$transaction(async (tx) => {
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

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.DELETE,
    entityType: "ProductVariant",
    entityId: deleted.id,
    before: existing,
    after: deleted,
  });

  return deleted;
}
