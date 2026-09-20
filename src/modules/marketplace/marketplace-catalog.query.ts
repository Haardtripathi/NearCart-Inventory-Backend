import { LanguageCode } from "@prisma/client";

import { prisma } from "../../config/prisma";
import type { LocaleContext } from "../../utils/localization";

/**
 * Catalog candidate selection for the marketplace bridge.
 *
 * WHY RAW SQL: the catalog listing has to order and filter by things that live one and two joins
 * away from Product — the default variant's price, and that variant's live InventoryBalance at one
 * branch. The previous implementation solved that by loading EVERY active product of the
 * organization with its whole relation tree (13 remote round trips returning the entire catalog),
 * serializing all of it, then sorting and slicing the page in JavaScript. That is O(catalog) work
 * and O(catalog) network transfer for every single page view, and it only ever returns `limit`
 * rows. At a few hundred products per shop it is the bulk of a ~3s response; at tens of thousands
 * it does not work at all.
 *
 * This resolves the page — filter, sort, offset, limit AND the filtered total — in ONE query
 * against the database, and returns just the product ids on that page. The caller then hydrates
 * only those ids. Nothing here is cached: the availability figures it filters and sorts on are
 * read live from InventoryBalance, same as the hydrate step that produces the numbers actually
 * shown to the customer.
 *
 * Ordering is kept equivalent to the JavaScript comparators it replaces (see applyCatalogSort's
 * history): "featured" = available first, then IN_STOCK / LOW_STOCK / OUT_OF_STOCK, then localized
 * name; price sorts use the same rounded price the response reports. Two deliberate differences:
 * name comparison uses SQLite's NOCASE collation rather than String.localeCompare, and every sort
 * ends with `Product.id` as a tiebreaker — without a unique final key, two rows that compare equal
 * can swap places between requests, which makes DB-side pagination drop or repeat rows across
 * pages.
 */

export type CatalogSort = "featured" | "name-asc" | "price-asc" | "price-desc" | "newest";

export interface CatalogCandidateQuery {
  branchId: string;
  search?: string;
  category?: string;
  brand?: string;
  inStockOnly?: boolean;
  sort: CatalogSort;
}

export interface CatalogCandidatePage {
  productIds: string[];
  totalItems: number;
}

interface SqlFragment {
  text: string;
  params: unknown[];
}

// Available units the customer can actually buy, matching resolveVariantStockSummary's
// `Math.max(0, Math.floor(onHand - reserved))`. CAST(... AS INTEGER) truncates toward zero, which
// is floor for the non-negative values that survive the MAX(0, ...).
const AVAILABLE_QTY_SQL = `MAX(0, CAST(COALESCE(ib."onHand", 0) - COALESCE(ib."reserved", 0) AS INTEGER))`;

// Mirrors isLowStock(onHand, reorderLevel, minStockLevel): onHand <= max(reorderLevel,
// minStockLevel), with the same 0 floor decimalMax applies to nulls.
const LOW_STOCK_SQL = `COALESCE(ib."onHand", 0) <= MAX(COALESCE(dv."reorderLevel", 0), COALESCE(dv."minStockLevel", 0), 0)`;

// "IN_STOCK" < "LOW_STOCK" < "OUT_OF_STOCK" — the string ordering the JS comparator relied on,
// expressed as a rank so the database can sort on it.
const STOCK_RANK_SQL = `(CASE WHEN ${AVAILABLE_QTY_SQL} <= 0 THEN 2 WHEN ${LOW_STOCK_SQL} THEN 1 ELSE 0 END)`;

const AVAILABILITY_RANK_SQL = `(CASE WHEN ${AVAILABLE_QTY_SQL} > 0 THEN 0 ELSE 1 END)`;

/**
 * Localized product name as `resolveLocalizedText` would compute it: first non-blank translation
 * along the locale's fallback chain, else the base Product.name. One LEFT JOIN per fallback
 * language (at most four, usually one or two), each hitting ProductTranslation's
 * [productId, language] unique index.
 */
function buildDisplayNameSql(fallbackLanguages: LanguageCode[]) {
  const joins = fallbackLanguages.map((_, index) => `pt${index}`);
  const parts = joins.map((alias) => `NULLIF(TRIM(${alias}."name"), '')`);
  parts.push(`NULLIF(TRIM(p."name"), '')`);

  return `COALESCE(${parts.join(", ")})`;
}

function buildTranslationJoins(fallbackLanguages: LanguageCode[]): SqlFragment {
  const text = fallbackLanguages
    .map(
      (_, index) =>
        `LEFT JOIN "ProductTranslation" pt${index} ON pt${index}."productId" = p."id" AND pt${index}."language" = ?`,
    )
    .join("\n  ");

  return { text, params: [...fallbackLanguages] };
}

function buildWhere(organizationId: string, query: CatalogCandidateQuery): SqlFragment {
  const clauses: string[] = [`p."organizationId" = ?`, `p."deletedAt" IS NULL`, `p."status" = 'ACTIVE'`];
  const params: unknown[] = [organizationId];

  if (query.search) {
    // Same shape as Prisma's `contains` on SQLite: a bare LIKE with the term wrapped in `%`, no
    // ESCAPE clause (so a literal `%` in the search term behaves exactly as it did before), and
    // SQLite's default ASCII-case-insensitive LIKE.
    const pattern = `%${query.search}%`;
    clauses.push(
      `(p."name" LIKE ? OR p."slug" LIKE ? OR EXISTS (SELECT 1 FROM "ProductTranslation" st WHERE st."productId" = p."id" AND st."name" LIKE ?))`,
    );
    params.push(pattern, pattern, pattern);
  }

  // BUG FIX (was silent): the previous Prisma `where` spread `...(search ? { OR } : {})` and then
  // `...(category ? { OR } : {})` into the same object literal, so a category or brand filter
  // overwrote the search filter's `OR` key outright and the search term was quietly ignored.
  // Each filter is its own AND-ed clause here, so search + category now compose.
  if (query.category) {
    clauses.push(
      `(p."categoryId" = ? OR EXISTS (SELECT 1 FROM "Category" c WHERE c."id" = p."categoryId" AND c."slug" = ?))`,
    );
    params.push(query.category, query.category);
  }

  if (query.brand) {
    clauses.push(
      `(p."brandId" = ? OR EXISTS (SELECT 1 FROM "Brand" b WHERE b."id" = p."brandId" AND b."slug" = ?))`,
    );
    params.push(query.brand, query.brand);
  }

  if (query.inStockOnly) {
    clauses.push(`${AVAILABLE_QTY_SQL} > 0`);
  }

  return { text: clauses.join("\n    AND "), params };
}

function buildOrderBy(sort: CatalogSort, displayNameSql: string) {
  switch (sort) {
    case "name-asc":
      return `${displayNameSql} COLLATE NOCASE ASC, p."id" ASC`;
    case "price-asc":
      return `ROUND(dv."sellingPrice") ASC, p."name" COLLATE NOCASE ASC, p."id" ASC`;
    case "price-desc":
      return `ROUND(dv."sellingPrice") DESC, p."name" COLLATE NOCASE ASC, p."id" ASC`;
    case "newest":
      return `p."createdAt" DESC, p."id" ASC`;
    case "featured":
    default:
      return `${AVAILABILITY_RANK_SQL} ASC, ${STOCK_RANK_SQL} ASC, ${displayNameSql} COLLATE NOCASE ASC, p."id" ASC`;
  }
}

/**
 * The FROM/JOIN block shared by the page query and the fallback count query.
 *
 * `dv` picks each product's sellable variant exactly as getDefaultVariant does — the one flagged
 * isDefault, else the oldest active one. The JOIN (not LEFT JOIN) onto it also reproduces
 * serializeMarketplaceProduct returning null, and applyCatalogSort dropping it, for a product with
 * no active variant at all.
 */
function buildFrom(organizationId: string, branchId: string, translationJoins: SqlFragment): SqlFragment {
  return {
    text: `
  FROM "Product" p
  JOIN (
    SELECT v."id" AS "variantId", v."productId", v."sellingPrice", v."reorderLevel", v."minStockLevel",
           ROW_NUMBER() OVER (PARTITION BY v."productId" ORDER BY v."isDefault" DESC, v."createdAt" ASC) AS rn
    FROM "ProductVariant" v
    WHERE v."organizationId" = ? AND v."deletedAt" IS NULL AND v."isActive" = 1
  ) dv ON dv."productId" = p."id" AND dv.rn = 1
  LEFT JOIN "InventoryBalance" ib ON ib."variantId" = dv."variantId" AND ib."branchId" = ?
  ${translationJoins.text}`,
    params: [organizationId, branchId, ...translationJoins.params],
  };
}

export async function selectCatalogCandidates(
  organizationId: string,
  query: CatalogCandidateQuery,
  localeContext: LocaleContext,
  page: { skip: number; take: number },
): Promise<CatalogCandidatePage> {
  const fallbackLanguages = localeContext.fallbackLanguages.slice(0, 4);
  const displayNameSql = buildDisplayNameSql(fallbackLanguages);
  const translationJoins = buildTranslationJoins(fallbackLanguages);
  const from = buildFrom(organizationId, query.branchId, translationJoins);
  const where = buildWhere(organizationId, query);

  const sql = `SELECT p."id" AS "id", COUNT(*) OVER () AS "totalItems"${from.text}
  WHERE ${where.text}
  ORDER BY ${buildOrderBy(query.sort, displayNameSql)}
  LIMIT ? OFFSET ?`;

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; totalItems: number | bigint }>>(
    sql,
    ...from.params,
    ...where.params,
    page.take,
    page.skip,
  );

  if (rows.length > 0) {
    return {
      productIds: rows.map((row) => row.id),
      totalItems: Number(rows[0]!.totalItems),
    };
  }

  // An empty page past the first one tells us nothing about the total (the window function needs
  // at least one row), so fall back to a dedicated COUNT. Page 1 coming back empty genuinely means
  // zero matches, and costs no extra round trip.
  if (page.skip === 0) {
    return { productIds: [], totalItems: 0 };
  }

  const countRows = await prisma.$queryRawUnsafe<Array<{ totalItems: number | bigint }>>(
    `SELECT COUNT(*) AS "totalItems"${from.text}
  WHERE ${where.text}`,
    ...from.params,
    ...where.params,
  );

  return { productIds: [], totalItems: Number(countRows[0]?.totalItems ?? 0) };
}
