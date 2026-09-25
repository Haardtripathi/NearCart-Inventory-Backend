"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const express_1 = require("express");
const ApiResponse_1 = require("../utils/ApiResponse");
const auth_route_1 = require("../modules/auth/auth.route");
const meta_route_1 = require("../modules/meta/meta.route");
const platform_route_1 = require("../modules/platform/platform.route");
const organizations_route_1 = require("../modules/organizations/organizations.route");
const branches_route_1 = require("../modules/branches/branches.route");
const categories_route_1 = require("../modules/categories/categories.route");
const brands_route_1 = require("../modules/brands/brands.route");
const units_route_1 = require("../modules/units/units.route");
const tax_rates_route_1 = require("../modules/tax-rates/tax-rates.route");
const suppliers_route_1 = require("../modules/suppliers/suppliers.route");
const customers_route_1 = require("../modules/customers/customers.route");
const products_route_1 = require("../modules/products/products.route");
const master_catalog_route_1 = require("../modules/master-catalog/master-catalog.route");
const inventory_route_1 = require("../modules/inventory/inventory.route");
const purchases_route_1 = require("../modules/purchases/purchases.route");
const sales_orders_route_1 = require("../modules/sales-orders/sales-orders.route");
const stock_transfers_route_1 = require("../modules/stock-transfers/stock-transfers.route");
const audit_route_1 = require("../modules/audit/audit.route");
const users_route_1 = require("../modules/users/users.route");
const translation_route_1 = require("../modules/translation/translation.route");
const uploads_route_1 = require("../modules/uploads/uploads.route");
const marketplace_route_1 = require("../modules/marketplace/marketplace.route");
const driver_auth_route_1 = require("../modules/driver-auth/driver-auth.route");
const driver_orders_route_1 = require("../modules/driver-orders/driver-orders.route");
const drivers_route_1 = require("../modules/drivers/drivers.route");
const driver_verification_route_1 = require("../modules/driver-verification/driver-verification.route");
const analytics_route_1 = require("../modules/analytics/analytics.route");
const notifications_route_1 = require("../modules/notifications/notifications.route");
const shop_status_route_1 = require("../modules/shop-status/shop-status.route");
const location_route_1 = require("../modules/location/location.route");
exports.apiRouter = (0, express_1.Router)();
exports.apiRouter.get("/health", (_req, res) => {
    return (0, ApiResponse_1.sendSuccess)(res, 200, "NearCart Inventory backend is healthy", {
        status: "ok",
        timestamp: new Date().toISOString(),
    });
});
exports.apiRouter.use("/auth", auth_route_1.authRouter);
exports.apiRouter.use("/meta", meta_route_1.metaRouter);
exports.apiRouter.use("/platform", platform_route_1.platformRouter);
exports.apiRouter.use("/organizations", organizations_route_1.organizationsRouter);
exports.apiRouter.use("/branches", branches_route_1.branchesRouter);
exports.apiRouter.use("/categories", categories_route_1.categoriesRouter);
exports.apiRouter.use("/brands", brands_route_1.brandsRouter);
exports.apiRouter.use("/units", units_route_1.unitsRouter);
exports.apiRouter.use("/tax-rates", tax_rates_route_1.taxRatesRouter);
exports.apiRouter.use("/suppliers", suppliers_route_1.suppliersRouter);
exports.apiRouter.use("/customers", customers_route_1.customersRouter);
exports.apiRouter.use("/products", products_route_1.productsRouter);
exports.apiRouter.use("/master-catalog", master_catalog_route_1.masterCatalogRouter);
exports.apiRouter.use("/inventory", inventory_route_1.inventoryRouter);
exports.apiRouter.use("/purchases", purchases_route_1.purchasesRouter);
exports.apiRouter.use("/sales-orders", sales_orders_route_1.salesOrdersRouter);
exports.apiRouter.use("/stock-transfers", stock_transfers_route_1.stockTransfersRouter);
exports.apiRouter.use("/audit-logs", audit_route_1.auditRouter);
exports.apiRouter.use("/users", users_route_1.usersRouter);
exports.apiRouter.use("/translate-item", translation_route_1.translationRouter);
exports.apiRouter.use("/uploads", uploads_route_1.uploadsRouter);
exports.apiRouter.use("/internal/marketplace", marketplace_route_1.marketplaceRouter);
exports.apiRouter.use("/driver-auth", driver_auth_route_1.driverAuthRouter);
// Bug fix: driverVerificationRouter must mount BEFORE driverOrdersRouter. Both share the "/driver"
// prefix and each does a path-less `router.use(<authMiddleware>)` — that runs unconditionally for
// EVERY request under the prefix the moment it enters that router, before Express even checks
// whether any route further down matches. With driverOrdersRouter mounted first (as it was),
// every /driver/verification/* request hit driverOrdersRouter's strict `authenticateDriver` FIRST
// (rejecting any non-VERIFIED driver) and never reached driverVerificationRouter's own, more
// permissive `authenticateDriverForVerification` at all — silently defeating the pending-driver
// evidence-submission fix (see driverAuth.middleware.ts). Mounting verification first fixes this:
// a /driver/verification/* request now matches a real route there and responds without ever
// falling through to driverOrdersRouter. A /driver/orders (etc.) request still falls through
// driverVerificationRouter (no matching route there) to driverOrdersRouter's own check, which
// still gates it exactly as strictly as before — this only reorders which router's blanket
// middleware runs first, not what either one allows.
exports.apiRouter.use("/driver", driver_verification_route_1.driverVerificationRouter);
exports.apiRouter.use("/driver", driver_orders_route_1.driverOrdersRouter);
exports.apiRouter.use("/drivers", drivers_route_1.driversRouter);
exports.apiRouter.use("/analytics", analytics_route_1.analyticsRouter);
exports.apiRouter.use("/notifications", notifications_route_1.notificationsRouter);
exports.apiRouter.use("/shop-status", shop_status_route_1.shopStatusRouter);
exports.apiRouter.use("/location", location_route_1.locationRouter);
