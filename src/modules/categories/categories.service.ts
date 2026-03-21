import { AuditAction, LanguageCode } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import type { LocaleContext } from "../../utils/localization";
import { serializeLocalizedEntity } from "../../utils/localization";
import { buildPagination, getPagination } from "../../utils/pagination";
import { slugify } from "../../utils/slug";
import { assertCategoryInOrg } from "../../utils/guards";
import { toNullableJsonValue } from "../../utils/json";
import { upsertTranslations } from "../../utils/translations";
import { enrichWithAutoTranslations } from "../../utils/autoTranslate";
import { createAuditLog } from "../audit/audit.service";

interface CategoryTranslationInput {
  language: LanguageCode;
  name: string;
  description?: string;
}

function serializeCategory(
  category: Awaited<ReturnType<typeof getCategoryRecordById>>,
  localeContext: LocaleContext,
) {
  const localizedCategory = serializeLocalizedEntity(category, localeContext);

  return {
    ...localizedCategory,
    parent: category.parent ? serializeLocalizedEntity(category.parent, localeContext) : null,
    children: category.children.map((child) => serializeLocalizedEntity(child, localeContext)),
  };
}

async function getCategoryRecordById(organizationId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      organizationId,
      deletedAt: null,
    },
    include: {
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
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
  });

  if (!category) {
    throw ApiError.notFound("Category not found");
  }

  return category;
}

async function assertNoCircularParent(organizationId: string, categoryId: string, parentId: string) {
  let currentParentId: string | null = parentId;

  while (currentParentId) {
    if (currentParentId === categoryId) {
      throw ApiError.badRequest("Category circular parent relation is not allowed");
    }

    const parentCategory: { parentId: string | null } | null = await prisma.category.findFirst({
      where: {
        id: currentParentId,
        organizationId,
        deletedAt: null,
      },
      select: {
        parentId: true,
      },
    });

    currentParentId = parentCategory?.parentId ?? null;
  }
}

export async function listCategories(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
    parentId?: string;
    isActive?: boolean;
  },
  localeContext: LocaleContext,
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    deletedAt: null,
    ...(query.parentId ? { parentId: query.parentId } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
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
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.category.findMany({
      where,
      include: {
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
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      skip,
      take: limit,
    }),
    prisma.category.count({ where }),
  ]);

  return {
    items: items.map((category) => serializeCategory(category, localeContext)),
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function getCategoryTree(organizationId: string, localeContext: LocaleContext) {
  const categories = await prisma.category.findMany({
    where: {
      organizationId,
      deletedAt: null,
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

  const map = new Map(
    categories.map((category) => [
      category.id,
      {
        ...serializeLocalizedEntity(category, localeContext),
        children: [] as Array<Record<string, unknown>>,
      },
    ]),
  );

  const roots: Array<Record<string, unknown>> = [];

  for (const category of categories) {
    const current = map.get(category.id)!;

    if (category.parentId && map.has(category.parentId)) {
      (map.get(category.parentId)! as { children: unknown[] }).children.push(current);
    } else {
      roots.push(current);
    }
  }

  return roots;
}

export async function createCategory(
  organizationId: string,
  actorUserId: string,
  input: {
      parentId?: string;
      name: string;
      slug?: string;
      description?: string;
      isActive?: boolean;
      sortOrder?: number;
      customFields?: unknown;
      translations?: CategoryTranslationInput[];
    },
  localeContext: LocaleContext,
) {
  if (input.parentId) {
    await assertCategoryInOrg(prisma, organizationId, input.parentId);
  }

  const translations = await enrichWithAutoTranslations<CategoryTranslationInput>({
    organizationId,
    baseName: input.name,
    baseDescription: input.description,
    existingTranslations: input.translations,
  });

  const category = await prisma.$transaction(async (tx) => {
    const created = await tx.category.create({
      data: {
        organizationId,
        parentId: input.parentId ?? null,
        name: input.name.trim(),
        slug: slugify(input.slug ?? input.name),
        description: input.description ?? null,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        customFields: toNullableJsonValue(input.customFields),
      },
    });

    if (translations.length) {
      await tx.categoryTranslation.createMany({
        data: translations.map((translation) => ({
          categoryId: created.id,
          language: translation.language,
          name: translation.name.trim(),
          description: translation.description?.trim() ?? null,
        })),
      });
    }

    return created;
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.CREATE,
    entityType: "Category",
    entityId: category.id,
    after: category,
  });

  return serializeCategory(await getCategoryRecordById(organizationId, category.id), localeContext);
}

export async function getCategoryById(
  organizationId: string,
  categoryId: string,
  localeContext: LocaleContext,
) {
  return serializeCategory(await getCategoryRecordById(organizationId, categoryId), localeContext);
}

export async function updateCategory(
  organizationId: string,
  categoryId: string,
  actorUserId: string,
  input: Partial<{
    parentId: string | null;
    name: string;
    slug: string;
    description: string;
    isActive: boolean;
    sortOrder: number;
    customFields: unknown;
    translations: CategoryTranslationInput[];
  }>,
  localeContext: LocaleContext,
) {
  const existing = await getCategoryRecordById(organizationId, categoryId);
  const translations = await enrichWithAutoTranslations<CategoryTranslationInput>({
    organizationId,
    baseName: input.name ?? existing.name,
    baseDescription: input.description ?? existing.description ?? undefined,
    existingTranslations:
      input.translations ??
      existing.translations.map((translation) => ({
        language: translation.language,
        name: translation.name,
        description: translation.description ?? undefined,
      })),
  });

  if (input.parentId !== undefined) {
    if (input.parentId === categoryId) {
      throw ApiError.badRequest("Category cannot be its own parent");
    }

    if (input.parentId) {
      await assertCategoryInOrg(prisma, organizationId, input.parentId);
      await assertNoCircularParent(organizationId, categoryId, input.parentId);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.category.update({
      where: { id: categoryId },
      data: {
        ...(input.parentId !== undefined
          ? input.parentId
            ? { parent: { connect: { id: input.parentId } } }
            : { parent: { disconnect: true } }
          : {}),
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.slug ? { slug: slugify(input.slug) } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.customFields !== undefined ? { customFields: toNullableJsonValue(input.customFields) } : {}),
      },
    });

    await upsertTranslations({
      entries: translations,
      listExisting: () =>
        tx.categoryTranslation.findMany({
          where: {
            categoryId,
          },
          select: {
            id: true,
            language: true,
          },
        }),
      create: (translation) =>
        tx.categoryTranslation.create({
          data: {
            categoryId,
            language: translation.language,
            name: translation.name.trim(),
            description: translation.description?.trim() ?? null,
          },
        }),
      update: (existingTranslation, translation) =>
        tx.categoryTranslation.update({
          where: {
            id: existingTranslation.id,
          },
          data: {
            name: translation.name.trim(),
            description: translation.description?.trim() ?? null,
          },
        }),
    });
  });

  const updated = await getCategoryRecordById(organizationId, categoryId);

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.UPDATE,
    entityType: "Category",
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return serializeCategory(updated, localeContext);
}

export async function deleteCategory(organizationId: string, categoryId: string, actorUserId: string) {
  const category = await getCategoryRecordById(organizationId, categoryId);

  const [activeChildrenCount, linkedProductsCount] = await prisma.$transaction([
    prisma.category.count({
      where: {
        organizationId,
        parentId: categoryId,
        deletedAt: null,
        isActive: true,
      },
    }),
    prisma.product.count({
      where: {
        organizationId,
        categoryId,
        deletedAt: null,
      },
    }),
  ]);

  if (activeChildrenCount > 0) {
    throw ApiError.conflict("Cannot delete category with active child categories");
  }

  if (linkedProductsCount > 0) {
    throw ApiError.conflict("Cannot delete category with linked products");
  }

  const deleted = await prisma.category.update({
    where: { id: categoryId },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.DELETE,
    entityType: "Category",
    entityId: deleted.id,
    before: category,
    after: deleted,
  });

  return deleted;
}
