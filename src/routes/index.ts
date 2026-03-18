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
