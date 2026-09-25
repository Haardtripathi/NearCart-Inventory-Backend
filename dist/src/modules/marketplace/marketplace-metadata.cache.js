"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readThroughJsonCache = readThroughJsonCache;
exports.getOrgCatalogMetadata = getOrgCatalogMetadata;
exports.ensureCatalogMetadataCoverage = ensureCatalogMetadataCoverage;
exports.invalidateOrgCatalogMetadata = invalidateOrgCatalogMetadata;
const prisma_1 = require("../../config/prisma");
const redis_1 = require("../../config/redis");
/**
 * Per-organization catalog METADATA (categories, brands, units and their translations) for the
 * marketplace bridge.
 *
 * Why this exists: the bridge runs against a remote Turso/libSQL database, so cost on this path is
 * dominated by the NUMBER of round trips, not by row count. Prisma issues one query per relation
 * level, so the catalog endpoint's `include` tree alone cost 13 round trips, 8 of which were
 * nothing but category/brand/unit rows and their translations — the same handful of slow-changing
 * rows on every single request, plus another 8 for the `filters` block. Resolving those from one
 * cached per-org snapshot instead takes them off the hot path entirely.
 *
 * WHAT IS DELIBERATELY NOT IN HERE: stock. No InventoryBalance, no availability, no onHand /
 * reserved, nothing a cart validation depends on. Those are read fresh from the database on every
 * request (see marketplace.service.ts) because a stale "in stock" is a real failed order. Only
 * display metadata — names, slugs, symbols, translations — is cached.
 *
 * The snapshot is stored UNLOCALIZED (raw rows + all their translations); localization is applied
 * per request in JS, so one cache entry serves every language.
 *
 * Fail-open, like the token blacklist and the translation cache: any Redis error (including the
 * 1500 ms command timeout in config/redis.ts) falls through to a direct database read. A Redis
 * outage must degrade this endpoint to its old speed, never to a 500.
 */
// 60s: a shop owner renaming a category or brand sees it on the storefront within a minute, which
// is well inside the tolerance for display text, while still collapsing an entire burst of
// catalog/search requests (NearCart's /public/search fans out to every nearby shop at once) onto a
// single metadata read. Mutations also invalidate explicitly — see invalidateOrgCatalogMetadata.
const METADATA_CACHE_TTL_SECONDS = 60;
// Bump when the cached shape below changes, so old entries are ignored rather than mis-parsed
// after a deploy.
const METADATA_CACHE_VERSION = "v1";
// Upstash is a REST round trip like any other; pulling a multi-megabyte blob back through it would
// cost more than the database reads it replaces (and risks the 1500 ms command timeout). Orgs
// above this size simply read through to the database every time.
const METADATA_CACHE_MAX_BYTES = 256 * 1024;
/**
 * Circuit breaker around the cache's own Redis use, modelled on libreTranslate.ts's
 * isServiceKnownDown/markServiceDown.
 *
 * Fail-open is necessary but not sufficient here. config/redis.ts gives every command a 1500 ms
 * timeout, and this cache sits on a request path that is otherwise ~200 ms end to end — so a Redis
 * outage would make the bridge SLOWER than it was before the cache existed, paying 1500 ms to
 * learn nothing on every single request. After a failure, stop consulting Redis at all for a short
 * while and read straight through to the database, then try again. The database read is the
 * correct answer either way; this only decides whether it is worth asking Redis first.
 */
const REDIS_CIRCUIT_OPEN_MS = 30_000;
let redisUnavailableUntil = 0;
function isRedisKnownDown() {
    return Date.now() < redisUnavailableUntil;
}
function markRedisDown() {
    redisUnavailableUntil = Date.now() + REDIS_CIRCUIT_OPEN_MS;
}
/** The Redis client to use for caching, or null when there is none or it is currently failing. */
function getCacheRedis() {
    if (isRedisKnownDown()) {
        return null;
    }
    return (0, redis_1.getRedisClient)();
}
function cacheKey(organizationId) {
    return `mp-catalog-meta:${METADATA_CACHE_VERSION}:${organizationId}`;
}
/**
 * Read-through JSON cache with the same fail-open posture as everything else in this file: any
 * Redis error (or no Redis at all) simply runs `load` and returns its result. Used for the shop
 * directory (see listMarketplaceOrganizations), which is read on every customer app open and
 * changes only when a shop is onboarded, renamed or deactivated.
 *
 * `isValid` guards against a cache entry written by an older deployment with a different shape.
 * Nothing stock-related is ever passed through here.
 */
async function readThroughJsonCache(key, ttlSeconds, isValid, load) {
    const redis = getCacheRedis();
    if (redis) {
        try {
            const cached = await redis.get(key);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (isValid(parsed)) {
                    return parsed;
                }
            }
        }
        catch (error) {
            markRedisDown();
            console.warn(`[marketplace] Cache read failed for ${key} — reading through to the database`, error);
        }
    }
    const value = await load();
    if (redis) {
        const serialized = JSON.stringify(value);
        if (Buffer.byteLength(serialized, "utf8") <= METADATA_CACHE_MAX_BYTES) {
            try {
                await redis.set(key, serialized, "EX", ttlSeconds);
            }
            catch (error) {
                markRedisDown();
                console.warn(`[marketplace] Cache write failed for ${key} — continuing uncached`, error);
            }
        }
    }
    return value;
}
function normalizeTranslations(translations) {
    return translations.map((translation) => ({
        language: translation.language,
        name: translation.name ?? null,
        description: translation.description ?? null,
    }));
}
async function loadOrgCatalogMetadata(organizationId) {
    // Note these are NOT filtered by isActive/deletedAt: a product may still point at a category or
    // brand its owner has since deactivated, and the old `include`-based code surfaced that row's
    // name regardless (an `include` carries no filter). The soft-delete/active flags are carried on
    // each row instead, so the catalog's `filters` block can present only the live ones while
    // product rows still resolve their own category/brand name. Dropping that would silently blank
    // out product cards.
    const [categories, brands, units] = await Promise.all([
        prisma_1.prisma.category.findMany({
            where: { organizationId },
            select: {
                id: true,
                slug: true,
                name: true,
                description: true,
                isActive: true,
                deletedAt: true,
                sortOrder: true,
                translations: {
                    select: { language: true, name: true, description: true },
                    orderBy: { language: "asc" },
                },
            },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
        prisma_1.prisma.brand.findMany({
            where: { organizationId },
            select: {
                id: true,
                slug: true,
                name: true,
                isActive: true,
                deletedAt: true,
                translations: {
                    select: { language: true, name: true },
                    orderBy: { language: "asc" },
                },
            },
            orderBy: { name: "asc" },
        }),
        // Units are either org-owned or system-wide (Unit.organizationId is nullable), and a product
        // or variant can reference either — so both have to be in the lookup map.
        prisma_1.prisma.unit.findMany({
            where: { OR: [{ organizationId }, { organizationId: null }] },
            select: {
                id: true,
                code: true,
                name: true,
                symbol: true,
                translations: {
                    select: { language: true, name: true },
                    orderBy: { language: "asc" },
                },
            },
        }),
    ]);
    return {
        categories: categories.map((category) => ({
            id: category.id,
            slug: category.slug,
            name: category.name,
            description: category.description,
            isActive: category.isActive,
            isDeleted: category.deletedAt !== null,
            sortOrder: category.sortOrder,
            translations: normalizeTranslations(category.translations),
        })),
        brands: brands.map((brand) => ({
            id: brand.id,
            slug: brand.slug,
            name: brand.name,
            isActive: brand.isActive,
            isDeleted: brand.deletedAt !== null,
            translations: normalizeTranslations(brand.translations),
        })),
        units: units.map((unit) => ({
            id: unit.id,
            code: unit.code,
            name: unit.name,
            symbol: unit.symbol,
            translations: normalizeTranslations(unit.translations),
        })),
    };
}
function isOrgCatalogMetadata(value) {
    return (typeof value === "object" &&
        value !== null &&
        Array.isArray(value.categories) &&
        Array.isArray(value.brands) &&
        Array.isArray(value.units));
}
function buildIndex(metadata) {
    return {
        metadata,
        categoryById: new Map(metadata.categories.map((category) => [category.id, category])),
        brandById: new Map(metadata.brands.map((brand) => [brand.id, brand])),
        unitById: new Map(metadata.units.map((unit) => [unit.id, unit])),
    };
}
async function getOrgCatalogMetadata(organizationId) {
    const redis = getCacheRedis();
    const key = cacheKey(organizationId);
    if (redis) {
        try {
            const cached = await redis.get(key);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (isOrgCatalogMetadata(parsed)) {
                    return buildIndex(parsed);
                }
            }
        }
        catch (error) {
            markRedisDown();
            console.warn("[marketplace] Catalog metadata cache read failed — reading through to the database", error);
        }
    }
    const metadata = await loadOrgCatalogMetadata(organizationId);
    if (redis) {
        const serialized = JSON.stringify(metadata);
        if (Buffer.byteLength(serialized, "utf8") <= METADATA_CACHE_MAX_BYTES) {
            try {
                await redis.set(key, serialized, "EX", METADATA_CACHE_TTL_SECONDS);
            }
            catch (error) {
                markRedisDown();
                console.warn("[marketplace] Catalog metadata cache write failed — continuing uncached", error);
            }
        }
    }
    return buildIndex(metadata);
}
/**
 * Fills in any category/brand/unit a product actually references but the snapshot does not know
 * about. This is the cache's correctness backstop: a shop that creates a new category and a
 * product in it within the TTL window would otherwise render that product with no category at all
 * for up to a minute. Costs nothing in the normal case (no missing ids -> no query), and at most
 * one small `IN` lookup per entity type otherwise.
 */
async function ensureCatalogMetadataCoverage(index, references) {
    const missingCategoryIds = [...references.categoryIds].filter((id) => !index.categoryById.has(id));
    const missingBrandIds = [...references.brandIds].filter((id) => !index.brandById.has(id));
    const missingUnitIds = [...references.unitIds].filter((id) => !index.unitById.has(id));
    if (!missingCategoryIds.length && !missingBrandIds.length && !missingUnitIds.length) {
        return;
    }
    const [categories, brands, units] = await Promise.all([
        missingCategoryIds.length
            ? prisma_1.prisma.category.findMany({
                where: { id: { in: missingCategoryIds } },
                select: {
                    id: true,
                    slug: true,
                    name: true,
                    description: true,
                    isActive: true,
                    deletedAt: true,
                    sortOrder: true,
                    translations: { select: { language: true, name: true, description: true }, orderBy: { language: "asc" } },
                },
            })
            : Promise.resolve([]),
        missingBrandIds.length
            ? prisma_1.prisma.brand.findMany({
                where: { id: { in: missingBrandIds } },
                select: {
                    id: true,
                    slug: true,
                    name: true,
                    isActive: true,
                    deletedAt: true,
                    translations: { select: { language: true, name: true }, orderBy: { language: "asc" } },
                },
            })
            : Promise.resolve([]),
        missingUnitIds.length
            ? prisma_1.prisma.unit.findMany({
                where: { id: { in: missingUnitIds } },
                select: {
                    id: true,
                    code: true,
                    name: true,
                    symbol: true,
                    translations: { select: { language: true, name: true }, orderBy: { language: "asc" } },
                },
            })
            : Promise.resolve([]),
    ]);
    for (const category of categories) {
        index.categoryById.set(category.id, {
            id: category.id,
            slug: category.slug,
            name: category.name,
            description: category.description,
            isActive: category.isActive,
            isDeleted: category.deletedAt !== null,
            sortOrder: category.sortOrder,
            translations: normalizeTranslations(category.translations),
        });
    }
    for (const brand of brands) {
        index.brandById.set(brand.id, {
            id: brand.id,
            slug: brand.slug,
            name: brand.name,
            isActive: brand.isActive,
            isDeleted: brand.deletedAt !== null,
            translations: normalizeTranslations(brand.translations),
        });
    }
    for (const unit of units) {
        index.unitById.set(unit.id, {
            id: unit.id,
            code: unit.code,
            name: unit.name,
            symbol: unit.symbol,
            translations: normalizeTranslations(unit.translations),
        });
    }
}
/**
 * Drops the cached snapshot for one organization. Called from the category/brand/unit write paths
 * so a rename or a deactivation shows up on the storefront immediately instead of waiting out the
 * TTL. Never throws and never blocks the mutation it follows — if the delete fails, the entry
 * simply expires on its own within METADATA_CACHE_TTL_SECONDS.
 */
async function invalidateOrgCatalogMetadata(organizationId) {
    if (!organizationId) {
        return;
    }
    // Deliberately uses getRedisClient(), not getCacheRedis(): an invalidation is a correctness
    // operation, not a latency optimisation, and it runs off a write path rather than a read one. It
    // is worth attempting even while the read breaker is open.
    const redis = (0, redis_1.getRedisClient)();
    if (!redis) {
        return;
    }
    try {
        await redis.del(cacheKey(organizationId));
    }
    catch (error) {
        console.warn("[marketplace] Catalog metadata cache invalidation failed — entry will expire on its own", error);
    }
}
