import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createProductController,
  createVariantController,
  deleteProductController,
  deleteVariantController,
  getProductController,
  listProductsController,
  listVariantsController,
  updateProductController,
  updateVariantController,
} from "./products.controller";
import {
  createProductSchema,
  createVariantSchema,
  productQuerySchema,
  updateProductSchema,
  updateVariantSchema,
} from "./products.validation";

export const productsRouter = Router();

productsRouter.use(authenticate, requireOrganizationContext);

productsRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: productQuerySchema }), asyncHandler(listProductsController));
productsRouter.post("/", requireRoles(...MANAGER_ROLES), validateRequest({ body: createProductSchema }), asyncHandler(createProductController));
productsRouter.get("/:id", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(getProductController));
productsRouter.patch("/:id", requireRoles(...MANAGER_ROLES), validateRequest({ body: updateProductSchema }), asyncHandler(updateProductController));
productsRouter.delete("/:id", requireRoles(...MANAGER_ROLES), asyncHandler(deleteProductController));
productsRouter.get("/:id/variants", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(listVariantsController));
productsRouter.post("/:id/variants", requireRoles(...MANAGER_ROLES), validateRequest({ body: createVariantSchema }), asyncHandler(createVariantController));
productsRouter.patch("/:id/variants/:variantId", requireRoles(...MANAGER_ROLES), validateRequest({ body: updateVariantSchema }), asyncHandler(updateVariantController));
productsRouter.delete("/:id/variants/:variantId", requireRoles(...MANAGER_ROLES), asyncHandler(deleteVariantController));
