import { Router } from "express";

import { requireInternalServiceAuth } from "../../middlewares/internalService.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  cancelBridgedSalesOrderController,
  checkMarketplaceAvailabilityController,
  createBridgedSalesOrderController,
  getBranchActiveOrderCountController,
  getMarketplaceCatalogProductController,
  getSalesOrderByExternalIdController,
  listMarketplaceBrandsController,
  listMarketplaceCatalogController,
  listMarketplaceCategoriesController,
  listMarketplaceOrganizationsController,
} from "./marketplace.controller";
import {
  createBridgedSalesOrderSchema,
  externalOrderIdParamSchema,
  marketplaceAvailabilitySchema,
  marketplaceCatalogQuerySchema,
  marketplaceOrganizationsQuerySchema,
  marketplaceScopedQuerySchema,
  organizationBranchParamSchema,
  organizationExternalOrderIdParamSchema,
} from "./marketplace.validation";

// NOTE on the write-back contract (§3 of the phase-1 backend track): this router implements
// POST /organizations/:organizationId/sales-orders and GET /sales-orders/by-external/:externalOrderId
// exactly as documented (paths are relative to this router's /internal/marketplace mount, matching
// every other endpoint below). One judgment call not spelled out in the contract: `externalOrderId`
// is enforced unique GLOBALLY (Prisma `@unique`, not scoped per organization) since it is NearCart's
// own Order.id, which is already globally unique — so GET /sales-orders/by-external/:externalOrderId
// intentionally takes no organizationId. If NearCart's other agent assumed org-scoped lookup, this
// is the point to reconcile. See marketplace.service.ts createBridgedSalesOrder/getSalesOrderByExternalId
// for the rest of the implementation notes (customer find-or-create by phone, structured delivery
// address on SalesOrder.deliveryAddress). The two endpoints below it (cancel, active-order-count)
// ARE org-scoped in their path, unlike the read-by-external endpoint above — see each route's own
// comment for why.

export const marketplaceRouter = Router();

marketplaceRouter.use(requireInternalServiceAuth);

marketplaceRouter.get(
  "/organizations",
  validateRequest({ query: marketplaceOrganizationsQuerySchema }),
  asyncHandler(listMarketplaceOrganizationsController),
);

marketplaceRouter.get(
  "/organizations/:organizationId/catalog",
  validateRequest({ query: marketplaceCatalogQuerySchema }),
  asyncHandler(listMarketplaceCatalogController),
);

marketplaceRouter.get(
  "/organizations/:organizationId/catalog/:productId",
  validateRequest({ query: marketplaceScopedQuerySchema }),
  asyncHandler(getMarketplaceCatalogProductController),
);

marketplaceRouter.post(
  "/organizations/:organizationId/availability-check",
  validateRequest({ body: marketplaceAvailabilitySchema }),
  asyncHandler(checkMarketplaceAvailabilityController),
);

marketplaceRouter.get(
  "/organizations/:organizationId/categories",
  validateRequest({ query: marketplaceScopedQuerySchema }),
  asyncHandler(listMarketplaceCategoriesController),
);

marketplaceRouter.get(
  "/organizations/:organizationId/brands",
  validateRequest({ query: marketplaceScopedQuerySchema }),
  asyncHandler(listMarketplaceBrandsController),
);

marketplaceRouter.post(
  "/organizations/:organizationId/sales-orders",
  validateRequest({ body: createBridgedSalesOrderSchema }),
  asyncHandler(createBridgedSalesOrderController),
);

marketplaceRouter.get(
  "/sales-orders/by-external/:externalOrderId",
  validateRequest({ params: externalOrderIdParamSchema }),
  asyncHandler(getSalesOrderByExternalIdController),
);

// Cancel path is nested under /organizations/:organizationId (unlike the read-by-external
// endpoint above) so the caller confirms which org it expects the order to belong to —
// cancelBridgedSalesOrder 404s if the externalOrderId resolves to a different organization.
marketplaceRouter.patch(
  "/organizations/:organizationId/sales-orders/by-external/:externalOrderId/cancel",
  validateRequest({ params: organizationExternalOrderIdParamSchema }),
  asyncHandler(cancelBridgedSalesOrderController),
);

marketplaceRouter.get(
  "/organizations/:organizationId/branches/:branchId/active-order-count",
  validateRequest({ params: organizationBranchParamSchema }),
  asyncHandler(getBranchActiveOrderCountController),
);
