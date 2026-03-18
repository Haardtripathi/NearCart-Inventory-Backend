import { Router } from "express";
import { UserRole } from "@prisma/client";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createMasterCatalogCategoryController,
  createMasterCatalogItemController,
  getFeaturedMasterCatalogItemsController,
  getMasterCatalogCategoriesController,
  getMasterCatalogCategoryTreeController,
  getMasterCatalogItemController,
  getMasterCatalogItemsController,
  importManyMasterCatalogItemsController,
  importMasterCatalogItemController,
  updateMasterCatalogCategoryController,
  updateMasterCatalogItemController,
} from "./master-catalog.controller";
import {
  createMasterCatalogCategorySchema,
  createMasterCatalogItemSchema,
  featuredMasterCatalogItemsQuerySchema,
  importManyMasterCatalogItemsSchema,
  importMasterCatalogItemSchema,
  masterCatalogCategoriesQuerySchema,
  masterCatalogCategoryTreeQuerySchema,
  masterCatalogItemsQuerySchema,
  updateMasterCatalogCategorySchema,
  updateMasterCatalogItemSchema,
} from "./master-catalog.validation";

export const masterCatalogRouter = Router();

masterCatalogRouter.use(authenticate);

masterCatalogRouter.get(
  "/categories",
  requireRoles(...READ_WRITE_STAFF_ROLES),
  validateRequest({ query: masterCatalogCategoriesQuerySchema }),
  asyncHandler(getMasterCatalogCategoriesController),
);
masterCatalogRouter.get(
  "/categories/tree",
  requireRoles(...READ_WRITE_STAFF_ROLES),
  validateRequest({ query: masterCatalogCategoryTreeQuerySchema }),
  asyncHandler(getMasterCatalogCategoryTreeController),
);
masterCatalogRouter.post(
  "/categories",
  requireRoles(UserRole.SUPER_ADMIN),
  validateRequest({ body: createMasterCatalogCategorySchema }),
  asyncHandler(createMasterCatalogCategoryController),
);
masterCatalogRouter.patch(
  "/categories/:id",
  requireRoles(UserRole.SUPER_ADMIN),
  validateRequest({ body: updateMasterCatalogCategorySchema }),
  asyncHandler(updateMasterCatalogCategoryController),
);

masterCatalogRouter.get(
  "/items",
  requireRoles(...READ_WRITE_STAFF_ROLES),
  validateRequest({ query: masterCatalogItemsQuerySchema }),
  asyncHandler(getMasterCatalogItemsController),
);
masterCatalogRouter.get(
  "/items/:id",
  requireRoles(...READ_WRITE_STAFF_ROLES),
  asyncHandler(getMasterCatalogItemController),
);
masterCatalogRouter.post(
  "/items",
  requireRoles(UserRole.SUPER_ADMIN),
  validateRequest({ body: createMasterCatalogItemSchema }),
  asyncHandler(createMasterCatalogItemController),
);
masterCatalogRouter.patch(
  "/items/:id",
  requireRoles(UserRole.SUPER_ADMIN),
  validateRequest({ body: updateMasterCatalogItemSchema }),
  asyncHandler(updateMasterCatalogItemController),
);
masterCatalogRouter.post(
  "/items/:id/import",
  requireOrganizationContext,
  requireRoles(...MANAGER_ROLES),
  validateRequest({ body: importMasterCatalogItemSchema }),
  asyncHandler(importMasterCatalogItemController),
);
masterCatalogRouter.post(
  "/items/import-many",
  requireOrganizationContext,
  requireRoles(...MANAGER_ROLES),
  validateRequest({ body: importManyMasterCatalogItemsSchema }),
  asyncHandler(importManyMasterCatalogItemsController),
);
masterCatalogRouter.get(
  "/industries/:industryId/featured-items",
  requireRoles(...READ_WRITE_STAFF_ROLES),
  validateRequest({ query: featuredMasterCatalogItemsQuerySchema }),
  asyncHandler(getFeaturedMasterCatalogItemsController),
);
