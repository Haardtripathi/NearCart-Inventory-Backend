"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectCatalogCandidates = selectCatalogCandidates;
const prisma_1 = require("../../config/prisma");
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
function buildDisplayNameSql(fallbackLanguages) {
    const joins = fallbackLanguages.map((_, index) => `pt${index}`);
    const parts = joins.map((alias) => `NULLIF(TRIM(${alias}."name"), '')`);
    parts.push(`NULLIF(TRIM(p."name"), '')`);
    return `COALESCE(${parts.join(", ")})`;
}
function buildTranslationJoins(fallbackLanguages) {
    const text = fallbackLanguages
        .map((_, index) => `LEFT JOIN "ProductTranslation" pt${index} ON pt${index}."productId" = p."id" AND pt${index}."language" = ?`)
        .join("\n  ");
    return { text, params: [...fallbackLanguages] };
}
function buildWhere(organizationId, query) {
    const clauses = [`p."organizationId" = ?`, `p."deletedAt" IS NULL`, `p."status" = 'ACTIVE'`];
    const params = [organizationId];
    if (query.search) {
        // Same shape as Prisma's `contains` on SQLite: a bare LIKE with the term wrapped in `%`, no
        // ESCAPE clause (so a literal `%` in the search term behaves exactly as it did before), and
        // SQLite's default ASCII-case-insensitive LIKE.
        const pattern = `%${query.search}%`;
        clauses.push(`(p."name" LIKE ? OR p."slug" LIKE ? OR EXISTS (SELECT 1 FROM "ProductTranslation" st WHERE st."productId" = p."id" AND st."name" LIKE ?))`);
        params.push(pattern, pattern, pattern);
    }
    // BUG FIX (was silent): the previous Prisma `where` spread `...(search ? { OR } : {})` and then
    // `...(category ? { OR } : {})` into the same object literal, so a category or brand filter
    // overwrote the search filter's `OR` key outright and the search term was quietly ignored.
    // Each filter is its own AND-ed clause here, so search + category now compose.
    if (query.category) {
        clauses.push(`(p."categoryId" = ? OR EXISTS (SELECT 1 FROM "Category" c WHERE c."id" = p."categoryId" AND c."slug" = ?))`);
        params.push(query.category, query.category);
    }
    if (query.brand) {
        clauses.push(`(p."brandId" = ? OR EXISTS (SELECT 1 FROM "Brand" b WHERE b."id" = p."brandId" AND b."slug" = ?))`);
        params.push(query.brand, query.brand);
    }
    if (query.inStockOnly) {
        clauses.push(`${AVAILABLE_QTY_SQL} > 0`);
    }
    return { text: clauses.join("\n    AND "), params };
}
function buildOrderBy(sort, displayNameSql) {
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
function buildFrom(organizationId, branchId, translationJoins) {
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
async function selectCatalogCandidates(organizationId, query, localeContext, page) {
    const fallbackLanguages = localeContext.fallbackLanguages.slice(0, 4);
    const displayNameSql = buildDisplayNameSql(fallbackLanguages);
    const translationJoins = buildTranslationJoins(fallbackLanguages);
    const from = buildFrom(organizationId, query.branchId, translationJoins);
    const where = buildWhere(organizationId, query);
    const sql = `SELECT p."id" AS "id", COUNT(*) OVER () AS "totalItems"${from.text}
  WHERE ${where.text}
  ORDER BY ${buildOrderBy(query.sort, displayNameSql)}
  LIMIT ? OFFSET ?`;
    const rows = await prisma_1.prisma.$queryRawUnsafe(sql, ...from.params, ...where.params, page.take, page.skip);
    if (rows.length > 0) {
        return {
            productIds: rows.map((row) => row.id),
            totalItems: Number(rows[0].totalItems),
        };
    }
    // An empty page past the first one tells us nothing about the total (the window function needs
    // at least one row), so fall back to a dedicated COUNT. Page 1 coming back empty genuinely means
    // zero matches, and costs no extra round trip.
    if (page.skip === 0) {
        return { productIds: [], totalItems: 0 };
    }
    const countRows = await prisma_1.prisma.$queryRawUnsafe(`SELECT COUNT(*) AS "totalItems"${from.text}
  WHERE ${where.text}`, ...from.params, ...where.params);
    return { productIds: [], totalItems: Number(countRows[0]?.totalItems ?? 0) };
}
