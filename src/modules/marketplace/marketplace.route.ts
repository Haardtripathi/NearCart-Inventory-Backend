import { Router } from "express";

import { requireInternalServiceAuth } from "../../middlewares/internalService.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  checkMarketplaceAvailabilityController,
  getMarketplaceCatalogProductController,
  listMarketplaceBrandsController,
  listMarketplaceCatalogController,
  listMarketplaceCategoriesController,
  listMarketplaceOrganizationsController,
} from "./marketplace.controller";
import {
  marketplaceAvailabilitySchema,
  marketplaceCatalogQuerySchema,
  marketplaceOrganizationsQuerySchema,
  marketplaceScopedQuerySchema,
} from "./marketplace.validation";

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
