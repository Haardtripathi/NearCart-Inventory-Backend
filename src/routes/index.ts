import { Router } from "express";

import { sendSuccess } from "../utils/ApiResponse";
import { authRouter } from "../modules/auth/auth.route";
import { metaRouter } from "../modules/meta/meta.route";
import { platformRouter } from "../modules/platform/platform.route";
import { organizationsRouter } from "../modules/organizations/organizations.route";
import { branchesRouter } from "../modules/branches/branches.route";
import { categoriesRouter } from "../modules/categories/categories.route";
import { brandsRouter } from "../modules/brands/brands.route";
import { unitsRouter } from "../modules/units/units.route";
import { taxRatesRouter } from "../modules/tax-rates/tax-rates.route";
import { suppliersRouter } from "../modules/suppliers/suppliers.route";
import { customersRouter } from "../modules/customers/customers.route";
import { productsRouter } from "../modules/products/products.route";
import { masterCatalogRouter } from "../modules/master-catalog/master-catalog.route";
import { inventoryRouter } from "../modules/inventory/inventory.route";
import { purchasesRouter } from "../modules/purchases/purchases.route";
import { salesOrdersRouter } from "../modules/sales-orders/sales-orders.route";
import { stockTransfersRouter } from "../modules/stock-transfers/stock-transfers.route";
import { auditRouter } from "../modules/audit/audit.route";
import { usersRouter } from "../modules/users/users.route";
import { translationRouter } from "../modules/translation/translation.route";
import { uploadsRouter } from "../modules/uploads/uploads.route";
import { marketplaceRouter } from "../modules/marketplace/marketplace.route";
import { driverAuthRouter } from "../modules/driver-auth/driver-auth.route";
import { driverOrdersRouter } from "../modules/driver-orders/driver-orders.route";
import { driversRouter } from "../modules/drivers/drivers.route";
import { driverVerificationRouter } from "../modules/driver-verification/driver-verification.route";
import { analyticsRouter } from "../modules/analytics/analytics.route";
import { notificationsRouter } from "../modules/notifications/notifications.route";
import { shopStatusRouter } from "../modules/shop-status/shop-status.route";
import { locationRouter } from "../modules/location/location.route";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  return sendSuccess(res, 200, "NearCart Inventory backend is healthy", {
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/meta", metaRouter);
apiRouter.use("/platform", platformRouter);
apiRouter.use("/organizations", organizationsRouter);
apiRouter.use("/branches", branchesRouter);
apiRouter.use("/categories", categoriesRouter);
apiRouter.use("/brands", brandsRouter);
apiRouter.use("/units", unitsRouter);
apiRouter.use("/tax-rates", taxRatesRouter);
apiRouter.use("/suppliers", suppliersRouter);
apiRouter.use("/customers", customersRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/master-catalog", masterCatalogRouter);
apiRouter.use("/inventory", inventoryRouter);
apiRouter.use("/purchases", purchasesRouter);
apiRouter.use("/sales-orders", salesOrdersRouter);
apiRouter.use("/stock-transfers", stockTransfersRouter);
apiRouter.use("/audit-logs", auditRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/translate-item", translationRouter);
apiRouter.use("/uploads", uploadsRouter);
apiRouter.use("/internal/marketplace", marketplaceRouter);
apiRouter.use("/driver-auth", driverAuthRouter);
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
apiRouter.use("/driver", driverVerificationRouter);
apiRouter.use("/driver", driverOrdersRouter);
apiRouter.use("/drivers", driversRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/shop-status", shopStatusRouter);
apiRouter.use("/location", locationRouter);
