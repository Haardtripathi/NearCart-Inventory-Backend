import {
  AuditAction,
  LanguageCode,
  Prisma,
  ProductType,
  TrackMethod,
} from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { toDecimal } from "../../utils/decimal";
import type { LocaleContext } from "../../utils/localization";
import { serializeLocalizedEntity } from "../../utils/localization";
import { buildMasterItemSearchText, normalizeMasterCatalogAliasValues } from "../../utils/masterCatalog";
import { buildPagination, getPagination } from "../../utils/pagination";
import { slugify } from "../../utils/slug";
import { upsertTranslations } from "../../utils/translations";
import { toNullableJsonValue } from "../../utils/json";
import type { DbClient } from "../../types/prisma";
import { createAuditLog } from "../audit/audit.service";

interface NameDescriptionTranslationInput {
  language: LanguageCode;
  name: string;
  description?: string;
}

interface MasterItemTranslationInput extends NameDescriptionTranslationInput {
  shortName?: string;
}

interface MasterItemAliasInput {
  language: LanguageCode;
  value: string;
}

interface MasterVariantTranslationInput {
  language: LanguageCode;
  name: string;
}

interface MasterVariantTemplateInput {
  code: string;
  name: string;
  skuSuffix?: string;
  barcode?: string;
  attributes?: unknown;
  defaultCostPrice?: Prisma.Decimal.Value;
  defaultSellingPrice?: Prisma.Decimal.Value;
  defaultMrp?: Prisma.Decimal.Value;
  reorderLevel?: Prisma.Decimal.Value;
  minStockLevel?: Prisma.Decimal.Value;
  maxStockLevel?: Prisma.Decimal.Value;
  weight?: Prisma.Decimal.Value;
  unitCode?: string;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  metadata?: unknown;
  translations?: MasterVariantTranslationInput[];
}

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
} satisfies Prisma.MasterCatalogCategoryInclude;

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
} satisfies Prisma.MasterCatalogItemInclude;

type MasterCatalogCategoryRecord = Prisma.MasterCatalogCategoryGetPayload<{
  include: typeof masterCatalogCategoryInclude;
}>;

type MasterCatalogItemRecord = Prisma.MasterCatalogItemGetPayload<{
  include: typeof masterCatalogItemInclude;
}>;

function getMasterCategoryCanonicalFields(category: {
  code: string;
  translations: Array<{ language: LanguageCode; name: string; description: string | null }>;
}) {
  const englishTranslation = category.translations.find((translation) => translation.language === LanguageCode.EN);
  const fallbackTranslation = englishTranslation ?? category.translations[0];

  return {
    name: fallbackTranslation?.name ?? category.code,
    description: fallbackTranslation?.description ?? null,
  };
}

export function serializeMasterCatalogCategory(
  category: MasterCatalogCategoryRecord | (MasterCatalogCategoryRecord["children"][number] & { children?: unknown[] }),
  localeContext: LocaleContext,
): Record<string, unknown> {
  const canonicalFields = getMasterCategoryCanonicalFields(category);
  const localized = serializeLocalizedEntity(
    {
      ...category,
      name: canonicalFields.name,
      description: canonicalFields.description,
    },
    localeContext,
  );

  return {
    ...localized,
    parent:
      "parent" in category && category.parent
        ? serializeLocalizedEntity(
            {
              ...category.parent,
              ...getMasterCategoryCanonicalFields(category.parent),
            },
            localeContext,
          )
        : null,
    children:
      "children" in category && Array.isArray(category.children)
        ? category.children.map((child) => serializeMasterCatalogCategory(child as MasterCatalogCategoryRecord, localeContext))
        : [],
  };
}

function serializeMasterCatalogVariantTemplate(
  variantTemplate: MasterCatalogItemRecord["variantTemplates"][number],
  localeContext: LocaleContext,
) {
  return serializeLocalizedEntity(variantTemplate, localeContext);
}

export function serializeMasterCatalogItem(
  item: MasterCatalogItemRecord,
  localeContext: LocaleContext,
  options?: {
    currentOrganizationId?: string | null;
    organizationIndustryIds?: Set<string>;
  },
): Record<string, unknown> {
  const localized = serializeLocalizedEntity(
    {
      ...item,
      name: item.canonicalName,
      description: item.canonicalDescription,
    },
    localeContext,
    {
      getName: (translation) => (translation as MasterCatalogItemRecord["translations"][number]).name,
      getDescription: (translation) =>
        (translation as MasterCatalogItemRecord["translations"][number]).description,
    },
  );

  const alreadyImportedProductId =
    options?.currentOrganizationId
      ? item.importedProducts.find((product) => product.organizationId === options.currentOrganizationId)?.id ?? null
      : null;
  const importable =
    Boolean(options?.currentOrganizationId) &&
    item.isActive &&
    Boolean(options?.organizationIndustryIds?.has(item.industryId));

  return {
    ...localized,
    category: item.category ? serializeMasterCatalogCategory(item.category as MasterCatalogCategoryRecord, localeContext) : null,
    variantTemplates: item.variantTemplates.map((variantTemplate) =>
      serializeMasterCatalogVariantTemplate(variantTemplate, localeContext),
    ),
    alreadyImportedProductId,
    importable,
  };
}

async function getOrganizationIndustryIds(organizationId: string | null | undefined) {
  if (!organizationId) {
    return new Set<string>();
  }

  const configs = await prisma.organizationIndustryConfig.findMany({
    where: {
      organizationId,
    },
    select: {
      industryId: true,
    },
  });

  return new Set(configs.map((config) => config.industryId));
}

async function getMasterCatalogCategoryRecordById(categoryId: string) {
  const category = await prisma.masterCatalogCategory.findUnique({
    where: {
      id: categoryId,
    },
    include: masterCatalogCategoryInclude,
  });

  if (!category) {
    throw ApiError.notFound("Master catalog category not found");
  }

  return category;
}

async function getMasterCatalogItemRecordById(itemId: string) {
  const item = await prisma.masterCatalogItem.findUnique({
    where: {
      id: itemId,
    },
    include: masterCatalogItemInclude,
  });

  if (!item) {
    throw ApiError.notFound("Master catalog item not found");
  }

  return item;
}

async function rebuildMasterItemSearchText(db: DbClient, masterItemId: string) {
  const item = await db.masterCatalogItem.findUniqueOrThrow({
    where: {
      id: masterItemId,
    },
    include: {
      translations: true,
      aliases: true,
    },
  });

  const searchText = buildMasterItemSearchText({
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

async function upsertMasterCategoryTranslations(
  db: DbClient,
  masterCategoryId: string,
  translations: NameDescriptionTranslationInput[],
) {
  await upsertTranslations({
    entries: translations,
    listExisting: () =>
      db.masterCatalogCategoryTranslation.findMany({
        where: {
          masterCategoryId,
        },
        select: {
          id: true,
          language: true,
        },
      }),
    create: (translation) =>
      db.masterCatalogCategoryTranslation.create({
        data: {
          masterCategoryId,
          language: translation.language,
          name: translation.name.trim(),
          description: translation.description?.trim() ?? null,
        },
      }),
    update: (existing, translation) =>
      db.masterCatalogCategoryTranslation.update({
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

async function upsertMasterItemTranslations(
  db: DbClient,
  masterItemId: string,
  translations: MasterItemTranslationInput[],
) {
  await upsertTranslations({
    entries: translations,
    listExisting: () =>
      db.masterCatalogItemTranslation.findMany({
        where: {
          masterItemId,
        },
        select: {
          id: true,
          language: true,
        },
      }),
    create: (translation) =>
      db.masterCatalogItemTranslation.create({
        data: {
          masterItemId,
          language: translation.language,
          name: translation.name.trim(),
          shortName: translation.shortName?.trim() ?? null,
          description: translation.description?.trim() ?? null,
        },
      }),
    update: (existing, translation) =>
      db.masterCatalogItemTranslation.update({
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

async function replaceMasterItemAliases(
  db: DbClient,
  masterItemId: string,
  aliases: MasterItemAliasInput[],
) {
  const normalizedAliases = normalizeMasterCatalogAliasValues(
    aliases.map((alias) => ({
      language: alias.language,
      value: alias.value.trim(),
    })),
  );

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

async function upsertMasterVariantTranslations(
  db: DbClient,
  masterVariantTemplateId: string,
  translations: MasterVariantTranslationInput[],
) {
  await upsertTranslations({
    entries: translations,
    listExisting: () =>
      db.masterCatalogVariantTranslation.findMany({
        where: {
          masterVariantTemplateId,
        },
        select: {
          id: true,
          language: true,
        },
      }),
    create: (translation) =>
      db.masterCatalogVariantTranslation.create({
        data: {
          masterVariantTemplateId,
          language: translation.language,
          name: translation.name.trim(),
        },
      }),
    update: (existing, translation) =>
      db.masterCatalogVariantTranslation.update({
        where: {
          id: existing.id,
        },
        data: {
          name: translation.name.trim(),
        },
      }),
  });
}

async function normalizeMasterVariantDefaults(
  db: DbClient,
  masterItemId: string,
  preferredDefaultCode?: string,
) {
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

  const preferredTemplate =
    (preferredDefaultCode ? templates.find((template) => template.code === preferredDefaultCode) : null) ??
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

async function upsertMasterVariantTemplates(
  db: DbClient,
  masterItemId: string,
  templates: MasterVariantTemplateInput[],
) {
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
          attributes: toNullableJsonValue(template.attributes),
          defaultCostPrice:
            template.defaultCostPrice !== undefined ? toDecimal(template.defaultCostPrice) : undefined,
          defaultSellingPrice:
            template.defaultSellingPrice !== undefined ? toDecimal(template.defaultSellingPrice) : undefined,
          defaultMrp: template.defaultMrp !== undefined ? toDecimal(template.defaultMrp) : undefined,
          reorderLevel:
            template.reorderLevel !== undefined ? toDecimal(template.reorderLevel) : undefined,
          minStockLevel:
            template.minStockLevel !== undefined ? toDecimal(template.minStockLevel) : undefined,
          maxStockLevel:
            template.maxStockLevel !== undefined ? toDecimal(template.maxStockLevel) : undefined,
          weight: template.weight !== undefined ? toDecimal(template.weight) : undefined,
          unitCode: template.unitCode?.trim() ?? null,
          isActive: template.isActive ?? true,
          sortOrder: template.sortOrder ?? 0,
          metadata: toNullableJsonValue(template.metadata),
        },
      });

      await upsertMasterVariantTranslations(db, existing.id, template.translations ?? []);
      continue;
    }

    const created = await db.masterCatalogVariantTemplate.create({
      data: {
        masterItemId,
        code: template.code.trim(),
        name: template.name.trim(),
        skuSuffix: template.skuSuffix?.trim() ?? null,
        barcode: template.barcode?.trim() ?? null,
        attributes: toNullableJsonValue(template.attributes),
        defaultCostPrice:
          template.defaultCostPrice !== undefined ? toDecimal(template.defaultCostPrice) : null,
        defaultSellingPrice:
          template.defaultSellingPrice !== undefined ? toDecimal(template.defaultSellingPrice) : null,
        defaultMrp: template.defaultMrp !== undefined ? toDecimal(template.defaultMrp) : null,
        reorderLevel:
          template.reorderLevel !== undefined ? toDecimal(template.reorderLevel) : new Prisma.Decimal(0),
        minStockLevel:
          template.minStockLevel !== undefined ? toDecimal(template.minStockLevel) : new Prisma.Decimal(0),
        maxStockLevel: template.maxStockLevel !== undefined ? toDecimal(template.maxStockLevel) : null,
        weight: template.weight !== undefined ? toDecimal(template.weight) : null,
        unitCode: template.unitCode?.trim() ?? null,
        isDefault: template.isDefault ?? false,
        isActive: template.isActive ?? true,
        sortOrder: template.sortOrder ?? 0,
        metadata: toNullableJsonValue(template.metadata),
      },
    });

    await upsertMasterVariantTranslations(db, created.id, template.translations ?? []);
  }

  await normalizeMasterVariantDefaults(db, masterItemId, preferredDefaultCode);
}

export async function getMasterCatalogCategories(
  query: {
    industryId: string;
    parentId?: string;
    search?: string;
    page: number;
    limit: number;
  },
  localeContext: LocaleContext,
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    industryId: query.industryId,
    ...(query.parentId ? { parentId: query.parentId } : {}),
    ...(query.search
      ? {
          OR: [
            { code: { contains: query.search, mode: "insensitive" as const } },
            { slug: { contains: query.search, mode: "insensitive" as const } },
            {
              translations: {
                some: {
                  OR: [
                    { name: { contains: query.search, mode: "insensitive" as const } },
                    { description: { contains: query.search, mode: "insensitive" as const } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.masterCatalogCategory.findMany({
      where,
      include: masterCatalogCategoryInclude,
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      skip,
      take: limit,
    }),
    prisma.masterCatalogCategory.count({ where }),
  ]);

  return {
    items: items.map((item) => serializeMasterCatalogCategory(item, localeContext)),
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function getMasterCatalogCategoryTree(
  query: {
    industryId: string;
  },
  localeContext: LocaleContext,
) {
  const categories = await prisma.masterCatalogCategory.findMany({
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

  const localizedCategories = categories.map((category) =>
    serializeLocalizedEntity(
      {
        ...category,
        ...getMasterCategoryCanonicalFields(category),
      },
      localeContext,
    ),
  );

  const map = new Map(
    localizedCategories.map((category) => [
      category.id,
      {
        ...category,
        children: [] as Array<Record<string, unknown>>,
      },
    ]),
  );
  const roots: Array<Record<string, unknown>> = [];

  for (const category of categories) {
    const current = map.get(category.id)!;

    if (category.parentId && map.has(category.parentId)) {
      map.get(category.parentId)!.children.push(current);
      continue;
    }

    roots.push(current);
  }

  return roots;
}

export async function createMasterCatalogCategory(
  actorUserId: string,
  input: {
    industryId: string;
    parentId?: string;
    code: string;
    slug?: string;
    sortOrder?: number;
    iconKey?: string;
    imageUrl?: string;
    isActive?: boolean;
    metadata?: unknown;
    translations: NameDescriptionTranslationInput[];
  },
  localeContext: LocaleContext,
) {
  const category = await prisma.$transaction(async (tx) => {
    const created = await tx.masterCatalogCategory.create({
      data: {
        industryId: input.industryId,
        parentId: input.parentId ?? null,
        code: slugify(input.code).replace(/-/g, "_"),
        slug: slugify(input.slug ?? input.code),
        sortOrder: input.sortOrder ?? 0,
        iconKey: input.iconKey?.trim() ?? null,
        imageUrl: input.imageUrl?.trim() ?? null,
        isActive: input.isActive ?? true,
        metadata: toNullableJsonValue(input.metadata),
      },
    });

    await upsertMasterCategoryTranslations(tx, created.id, input.translations);
    return created;
  });

  const record = await getMasterCatalogCategoryRecordById(category.id);

  await createAuditLog(prisma, {
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "MasterCatalogCategory",
    entityId: category.id,
    after: record,
  });

  return serializeMasterCatalogCategory(record, localeContext);
}

export async function updateMasterCatalogCategory(
  categoryId: string,
  actorUserId: string,
  input: Partial<{
    industryId: string;
    parentId: string;
    code: string;
    slug: string;
    sortOrder: number;
    iconKey: string;
    imageUrl: string;
    isActive: boolean;
    metadata: unknown;
    translations: NameDescriptionTranslationInput[];
  }>,
  localeContext: LocaleContext,
) {
  const existing = await getMasterCatalogCategoryRecordById(categoryId);

  await prisma.$transaction(async (tx) => {
    await tx.masterCatalogCategory.update({
      where: {
        id: categoryId,
      },
      data: {
        ...(input.industryId !== undefined ? { industryId: input.industryId } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId || null } : {}),
        ...(input.code ? { code: slugify(input.code).replace(/-/g, "_") } : {}),
        ...(input.slug ? { slug: slugify(input.slug) } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.iconKey !== undefined ? { iconKey: input.iconKey || null } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.metadata !== undefined ? { metadata: toNullableJsonValue(input.metadata) } : {}),
      },
    });

    await upsertMasterCategoryTranslations(tx, categoryId, input.translations ?? []);
  });

  const updated = await getMasterCatalogCategoryRecordById(categoryId);

  await createAuditLog(prisma, {
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "MasterCatalogCategory",
    entityId: categoryId,
    before: existing,
    after: updated,
  });

  return serializeMasterCatalogCategory(updated, localeContext);
}

export async function getMasterCatalogItems(
  query: {
    industryId: string;
    categoryId?: string;
    q?: string;
    hasVariants?: boolean;
    isActive?: boolean;
    page: number;
    limit: number;
  },
  localeContext: LocaleContext,
  currentOrganizationId?: string | null,
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
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
            { code: { contains: normalizedQuery, mode: "insensitive" as const } },
            { slug: { contains: normalizedQuery, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, totalItems, organizationIndustryIds] = await Promise.all([
    prisma.masterCatalogItem.findMany({
      where,
      include: masterCatalogItemInclude,
      orderBy: [{ canonicalName: "asc" }],
      skip,
      take: limit,
    }),
    prisma.masterCatalogItem.count({ where }),
    getOrganizationIndustryIds(currentOrganizationId),
  ]);

  return {
    items: items.map((item) =>
      serializeMasterCatalogItem(item, localeContext, {
        currentOrganizationId,
        organizationIndustryIds,
      }),
    ),
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function getMasterCatalogItemById(
  itemId: string,
  localeContext: LocaleContext,
  currentOrganizationId?: string | null,
) {
  const [item, organizationIndustryIds] = await Promise.all([
    getMasterCatalogItemRecordById(itemId),
    getOrganizationIndustryIds(currentOrganizationId),
  ]);

  return serializeMasterCatalogItem(item, localeContext, {
    currentOrganizationId,
    organizationIndustryIds,
  });
}

export async function createMasterCatalogItem(
  actorUserId: string,
  input: {
    industryId: string;
    masterCategoryId?: string;
    code: string;
    slug?: string;
    canonicalName: string;
    canonicalDescription?: string;
    productType: ProductType;
    defaultTrackMethod: TrackMethod;
    defaultUnitCode?: string;
    defaultBrandName?: string;
    defaultTaxCode?: string;
    hasVariants?: boolean;
    trackInventory?: boolean;
    allowBackorder?: boolean;
    allowNegativeStock?: boolean;
    defaultImageUrl?: string;
    tags?: unknown;
    customFieldsTemplate?: unknown;
    metadata?: unknown;
    isActive?: boolean;
    translations?: MasterItemTranslationInput[];
    aliases?: MasterItemAliasInput[];
    variantTemplates?: MasterVariantTemplateInput[];
  },
  localeContext: LocaleContext,
) {
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.masterCatalogItem.create({
      data: {
        industryId: input.industryId,
        masterCategoryId: input.masterCategoryId ?? null,
        code: slugify(input.code).replace(/-/g, "_"),
        slug: slugify(input.slug ?? input.code),
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
        tags: toNullableJsonValue(input.tags),
        customFieldsTemplate: toNullableJsonValue(input.customFieldsTemplate),
        metadata: toNullableJsonValue(input.metadata),
        searchText: "",
        isActive: input.isActive ?? true,
      },
    });

    await upsertMasterItemTranslations(tx, created.id, input.translations ?? []);
    await replaceMasterItemAliases(tx, created.id, input.aliases ?? []);
    await upsertMasterVariantTemplates(tx, created.id, input.variantTemplates ?? []);
    await rebuildMasterItemSearchText(tx, created.id);

    return created;
  });

  const record = await getMasterCatalogItemRecordById(item.id);

  await createAuditLog(prisma, {
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "MasterCatalogItem",
    entityId: item.id,
    after: record,
  });

  return serializeMasterCatalogItem(record, localeContext);
}

export async function updateMasterCatalogItem(
  itemId: string,
  actorUserId: string,
  input: Partial<{
    industryId: string;
    masterCategoryId: string;
    code: string;
    slug: string;
    canonicalName: string;
    canonicalDescription: string;
    productType: ProductType;
    defaultTrackMethod: TrackMethod;
    defaultUnitCode: string;
    defaultBrandName: string;
    defaultTaxCode: string;
    hasVariants: boolean;
    trackInventory: boolean;
    allowBackorder: boolean;
    allowNegativeStock: boolean;
    defaultImageUrl: string;
    tags: unknown;
    customFieldsTemplate: unknown;
    metadata: unknown;
    isActive: boolean;
    translations: MasterItemTranslationInput[];
    aliases: MasterItemAliasInput[];
    variantTemplates: MasterVariantTemplateInput[];
  }>,
  localeContext: LocaleContext,
) {
  const existing = await getMasterCatalogItemRecordById(itemId);

  await prisma.$transaction(async (tx) => {
    await tx.masterCatalogItem.update({
      where: {
        id: itemId,
      },
      data: {
        ...(input.industryId !== undefined ? { industryId: input.industryId } : {}),
        ...(input.masterCategoryId !== undefined ? { masterCategoryId: input.masterCategoryId || null } : {}),
        ...(input.code ? { code: slugify(input.code).replace(/-/g, "_") } : {}),
        ...(input.slug ? { slug: slugify(input.slug) } : {}),
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
        ...(input.tags !== undefined ? { tags: toNullableJsonValue(input.tags) } : {}),
        ...(input.customFieldsTemplate !== undefined
          ? { customFieldsTemplate: toNullableJsonValue(input.customFieldsTemplate) }
          : {}),
        ...(input.metadata !== undefined ? { metadata: toNullableJsonValue(input.metadata) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await upsertMasterItemTranslations(tx, itemId, input.translations ?? []);

    if (input.aliases !== undefined) {
      await replaceMasterItemAliases(tx, itemId, input.aliases);
    }

    if (input.variantTemplates !== undefined) {
      await upsertMasterVariantTemplates(tx, itemId, input.variantTemplates);
    }

    await rebuildMasterItemSearchText(tx, itemId);
  });

  const updated = await getMasterCatalogItemRecordById(itemId);

  await createAuditLog(prisma, {
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "MasterCatalogItem",
    entityId: itemId,
    before: existing,
    after: updated,
  });

  return serializeMasterCatalogItem(updated, localeContext);
}

export async function getFeaturedMasterCatalogItems(
  industryId: string,
  query: {
    limit: number;
  },
  localeContext: LocaleContext,
  currentOrganizationId?: string | null,
) {
  const [items, organizationIndustryIds] = await Promise.all([
    prisma.masterCatalogItem.findMany({
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

  return items.map((item) =>
    serializeMasterCatalogItem(item, localeContext, {
      currentOrganizationId,
      organizationIndustryIds,
    }),
  );
}
