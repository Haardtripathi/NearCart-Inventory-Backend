import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createBrandController,
  deleteBrandController,
  getBrandController,
  listBrandsController,
  updateBrandController,
} from "./brands.controller";
import { brandQuerySchema, createBrandSchema, updateBrandSchema } from "./brands.validation";

export const brandsRouter = Router();

brandsRouter.use(authenticate, requireOrganizationContext);

brandsRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: brandQuerySchema }), asyncHandler(listBrandsController));
brandsRouter.post("/", requireRoles(...MANAGER_ROLES), validateRequest({ body: createBrandSchema }), asyncHandler(createBrandController));
brandsRouter.get("/:id", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(getBrandController));
brandsRouter.patch("/:id", requireRoles(...MANAGER_ROLES), validateRequest({ body: updateBrandSchema }), asyncHandler(updateBrandController));
brandsRouter.delete("/:id", requireRoles(...MANAGER_ROLES), asyncHandler(deleteBrandController));
