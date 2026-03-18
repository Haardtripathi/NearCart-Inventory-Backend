import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createCategoryController,
  deleteCategoryController,
  getCategoryController,
  getCategoryTreeController,
  listCategoriesController,
  updateCategoryController,
} from "./categories.controller";
import { categoryQuerySchema, createCategorySchema, updateCategorySchema } from "./categories.validation";

export const categoriesRouter = Router();

categoriesRouter.use(authenticate, requireOrganizationContext);

categoriesRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: categoryQuerySchema }), asyncHandler(listCategoriesController));
categoriesRouter.get("/tree", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(getCategoryTreeController));
categoriesRouter.post("/", requireRoles(...MANAGER_ROLES), validateRequest({ body: createCategorySchema }), asyncHandler(createCategoryController));
categoriesRouter.get("/:id", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(getCategoryController));
categoriesRouter.patch("/:id", requireRoles(...MANAGER_ROLES), validateRequest({ body: updateCategorySchema }), asyncHandler(updateCategoryController));
categoriesRouter.delete("/:id", requireRoles(...MANAGER_ROLES), asyncHandler(deleteCategoryController));
