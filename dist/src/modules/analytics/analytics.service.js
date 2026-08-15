"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsOverview = getAnalyticsOverview;
exports.getReorderSuggestions = getReorderSuggestions;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const decimal_1 = require("../../utils/decimal");
const stock_1 = require("../../utils/stock");
// Shop-owner-facing analytics for the mobile dashboard/analytics screens. Deliberately composed
// from existing SalesOrder/SalesOrderItem/InventoryBalance rows in plain JS (mirrors the mobile
// dashboard.api.ts's existing "no dedicated backend endpoint, compose client-side" approach, just
// moved server-side now that the aggregation is more than a couple of cheap list calls) rather
// than raw SQL date-bucketing — see sales-orders.service.ts's assignDriverToSalesOrder comment for
// why raw SQL against this SQLite/libSQL setup needs extra care; a 30-day, single-organization
// row-set is small enough that JS-side aggregation is simpler and safer than getting SQLite's
// strftime bucketing exactly right.
const TREND_DAYS = 7;
const TOP_PRODUCTS_WINDOW_DAYS = 30;
const TOP_PRODUCTS_LIMIT = 5;
// Orders that actually represent a completed/in-flight sale — PENDING/DRAFT haven't had stock
// deducted yet (see sales-orders.service.ts confirmSalesOrder) and REJECTED/CANCELLED/RETURNED
// never will, so none of those should count toward revenue.
const REVENUE_STATUSES = [
    client_1.SalesOrderStatus.CONFIRMED,
    client_1.SalesOrderStatus.READY,
    client_1.SalesOrderStatus.OUT_FOR_DELIVERY,
    client_1.SalesOrderStatus.DELIVERED,
];
function startOfDay(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}
// Deliberately NOT `startOfDay(date).toISOString().slice(0, 10)` — toISOString() always renders
// in UTC, while startOfDay()'s setHours(0,0,0,0) zeroes out the *local* clock, so for any
// positive-UTC-offset timezone (Asia/Kolkata — this app's own default org timezone — included)
// local midnight is still the *previous* UTC calendar day, silently shifting every trend/report
// date label back by one day (confirmed 2026-08-05: an order created at 21:13 IST today was
// labelled "yesterday"). Building the key from the local getFullYear/getMonth/getDate instead
// keeps label generation and order-classification in the same (local) calendar, matching what a
// shop owner actually means by "today".
function dayKey(date) {
    const local = startOfDay(date);
    const year = local.getFullYear();
    const month = String(local.getMonth() + 1).padStart(2, "0");
    const day = String(local.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function addDays(date, days) {
    return new Date(date.getTime() + days * 86_400_000);
}
async function getAnalyticsOverview(organizationId, branchId) {
    const now = new Date();
    const trendStart = startOfDay(addDays(now, -(TREND_DAYS - 1)));
    const topProductsStart = startOfDay(addDays(now, -(TOP_PRODUCTS_WINDOW_DAYS - 1)));
    const rangeStart = trendStart < topProductsStart ? trendStart : topProductsStart;
    const branchFilter = branchId ? { branchId } : {};
    // `totalOrders`/`orderStatusCounts` used to come from separate, unscoped (all-time) queries
    // while everything else on this endpoint — and the mobile/web screens that render it — is
    // explicitly framed as a 30-day window (`SummaryCard label="Orders (30d)"`, the Analytics
    // screen's "Last 30 days, all branches" subtitle, the "Order status breakdown" section sitting
    // directly under that same header). Confirmed by direct test 2026-08-08: backdating one
    // DELIVERED order to 60 days ago left `totalOrders` and `orderStatusCounts.DELIVERED` completely
    // unchanged while `revenue30d`/`topProducts` correctly dropped it — i.e. a shop owner with any
    // order history older than 30 days was shown an inflated, mislabeled "Orders (30d)" figure and a
    // status breakdown that silently included ancient orders. Since `rangeStart` already equals
    // `topProductsStart` (30 days back, the wider of the two windows) whenever
    // TOP_PRODUCTS_WINDOW_DAYS >= TREND_DAYS, `recentOrders` below already holds exactly the rows
    // both figures need — derive them from it instead of running two additional unscoped queries.
    const [recentOrders, lowStockBalances] = await Promise.all([
        prisma_1.prisma.salesOrder.findMany({
            where: {
                organizationId,
                ...branchFilter,
                createdAt: { gte: rangeStart },
            },
            select: {
                status: true,
                total: true,
                createdAt: true,
                items: {
                    select: {
                        productId: true,
                        productNameSnapshot: true,
                        quantity: true,
                        lineTotal: true,
                    },
                },
            },
        }),
        prisma_1.prisma.inventoryBalance.findMany({
            // Every other product query in this codebase filters `deletedAt: null` (see
            // products.service.ts); this one didn't, so a soft-deleted/archived product's stale
            // InventoryBalance row kept inflating `lowStockCount` forever — confirmed live 2026-08-08:
            // archiving 5 low-stock test products left the count unchanged until this filter was added.
            where: { organizationId, ...branchFilter, product: { deletedAt: null }, variant: { deletedAt: null } },
            select: {
                onHand: true,
                variant: { select: { reorderLevel: true, minStockLevel: true } },
            },
        }),
    ]);
    const trendBuckets = new Map();
    for (let i = 0; i < TREND_DAYS; i += 1) {
        trendBuckets.set(dayKey(addDays(trendStart, i)), { orders: 0, revenue: (0, decimal_1.toDecimal)(0) });
    }
    const topProducts = new Map();
    let revenue7d = (0, decimal_1.toDecimal)(0);
    let revenue30d = (0, decimal_1.toDecimal)(0);
    for (const order of recentOrders) {
        const isRevenue = REVENUE_STATUSES.includes(order.status);
        const key = dayKey(order.createdAt);
        const bucket = trendBuckets.get(key);
        if (bucket) {
            bucket.orders += 1;
            if (isRevenue) {
                bucket.revenue = bucket.revenue.plus(order.total);
            }
        }
        if (!isRevenue)
            continue;
        if (order.createdAt >= topProductsStart) {
            for (const item of order.items) {
                const existing = topProducts.get(item.productId);
                const quantity = (0, decimal_1.toDecimal)(item.quantity);
                const lineTotal = (0, decimal_1.toDecimal)(item.lineTotal);
                if (existing) {
                    existing.quantitySold = existing.quantitySold.plus(quantity);
                    existing.revenue = existing.revenue.plus(lineTotal);
                }
                else {
                    topProducts.set(item.productId, {
                        productId: item.productId,
                        name: item.productNameSnapshot,
                        quantitySold: quantity,
                        revenue: lineTotal,
                    });
                }
            }
        }
        if (order.createdAt >= topProductsStart) {
            revenue30d = revenue30d.plus(order.total);
        }
        if (order.createdAt >= trendStart) {
            revenue7d = revenue7d.plus(order.total);
        }
    }
    const salesTrend = Array.from(trendBuckets.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, bucket]) => ({
        date,
        orders: bucket.orders,
        revenue: bucket.revenue.toFixed(2),
    }));
    const topProductsList = Array.from(topProducts.values())
        .sort((a, b) => b.revenue.minus(a.revenue).toNumber())
        .slice(0, TOP_PRODUCTS_LIMIT)
        .map((item) => ({
        productId: item.productId,
        name: item.name,
        quantitySold: item.quantitySold.toNumber(),
        revenue: item.revenue.toFixed(2),
    }));
    const orderStatusCounts = {};
    for (const order of recentOrders) {
        orderStatusCounts[order.status] = (orderStatusCounts[order.status] ?? 0) + 1;
    }
    const lowStockCount = lowStockBalances.filter((balance) => (0, stock_1.isLowStock)(balance.onHand, balance.variant.reorderLevel, balance.variant.minStockLevel)).length;
    return {
        salesTrend,
        topProducts: topProductsList,
        orderStatusCounts,
        lowStockCount,
        totalOrders: recentOrders.length,
        pendingOrders: orderStatusCounts[client_1.SalesOrderStatus.PENDING] ?? 0,
        revenue7d: revenue7d.toFixed(2),
        revenue30d: revenue30d.toFixed(2),
    };
}
// Smart reorder suggestions: flags variants likely to stock out soon, computed honestly from real
// sales velocity (units sold per day over the last REORDER_VELOCITY_WINDOW_DAYS, from confirmed+
// SalesOrderItem rows — same REVENUE_STATUSES cutoff as the rest of this file, since PENDING/DRAFT
// haven't actually deducted stock yet and REJECTED/CANCELLED/RETURNED never will) against current
// InventoryBalance.onHand. No fabricated "AI" scoring — just daysOfStockLeft = onHand / velocity,
// which is the same arithmetic a shop owner would do by hand, just done for every SKU at once.
const REORDER_VELOCITY_WINDOW_DAYS = 30;
// A variant only needs to actually have sold something to have a velocity at all — one with zero
// sales in the window is excluded rather than reported as "infinite days left" or "0 days left".
const REORDER_URGENT_DAYS_THRESHOLD = 7;
const REORDER_SUGGESTIONS_LIMIT = 30;
async function getReorderSuggestions(organizationId, branchId) {
    const windowStart = startOfDay(addDays(new Date(), -(REORDER_VELOCITY_WINDOW_DAYS - 1)));
    const branchFilter = branchId ? { branchId } : {};
    const [recentItems, balances] = await Promise.all([
        prisma_1.prisma.salesOrderItem.findMany({
            where: {
                salesOrder: {
                    organizationId,
                    ...branchFilter,
                    status: { in: REVENUE_STATUSES },
                    createdAt: { gte: windowStart },
                },
            },
            select: {
                variantId: true,
                productId: true,
                quantity: true,
                productNameSnapshot: true,
                variantNameSnapshot: true,
                skuSnapshot: true,
            },
        }),
        prisma_1.prisma.inventoryBalance.findMany({
            // Same soft-delete gap as getAnalyticsOverview above — without this, a variant sold before
            // being archived could keep surfacing as a "reorder" suggestion for a product the shop no
            // longer carries.
            where: { organizationId, ...branchFilter, product: { deletedAt: null }, variant: { deletedAt: null } },
            select: {
                id: true,
                branchId: true,
                productId: true,
                variantId: true,
                onHand: true,
                reserved: true,
                branch: { select: { id: true, name: true } },
                variant: { select: { reorderLevel: true, minStockLevel: true } },
            },
        }),
    ]);
    const velocityByVariant = new Map();
    for (const item of recentItems) {
        const existing = velocityByVariant.get(item.variantId);
        const quantity = (0, decimal_1.toDecimal)(item.quantity);
        if (existing) {
            existing.quantitySold = existing.quantitySold.plus(quantity);
        }
        else {
            velocityByVariant.set(item.variantId, {
                quantitySold: quantity,
                productName: item.productNameSnapshot,
                variantName: item.variantNameSnapshot,
                sku: item.skuSnapshot,
            });
        }
    }
    const suggestions = balances
        .map((balance) => {
        const sales = velocityByVariant.get(balance.variantId);
        if (!sales)
            return null;
        const velocityPerDay = sales.quantitySold.div(REORDER_VELOCITY_WINDOW_DAYS);
        if (velocityPerDay.lessThanOrEqualTo(0))
            return null;
        const available = (0, stock_1.getAvailableStock)(balance.onHand, balance.reserved);
        const daysOfStockLeft = available.dividedBy(velocityPerDay);
        const isLow = (0, stock_1.isLowStock)(balance.onHand, balance.variant.reorderLevel, balance.variant.minStockLevel);
        const isUrgent = daysOfStockLeft.lessThanOrEqualTo(REORDER_URGENT_DAYS_THRESHOLD);
        if (!isLow && !isUrgent)
            return null;
        return {
            variantId: balance.variantId,
            productId: balance.productId,
            productName: sales.productName,
            variantName: sales.variantName,
            sku: sales.sku,
            branch: balance.branch,
            onHand: balance.onHand.toString(),
            available: available.toString(),
            quantitySoldWindow: sales.quantitySold.toString(),
            velocityPerDay: velocityPerDay.toFixed(2),
            daysOfStockLeft: Math.max(0, Math.round(daysOfStockLeft.toNumber())),
            reorderLevel: balance.variant.reorderLevel.toString(),
            isLowStock: isLow,
        };
    })
        .filter((row) => row !== null)
        .sort((a, b) => a.daysOfStockLeft - b.daysOfStockLeft)
        .slice(0, REORDER_SUGGESTIONS_LIMIT);
    return {
        items: suggestions,
        windowDays: REORDER_VELOCITY_WINDOW_DAYS,
    };
}
