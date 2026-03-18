import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createSupplierController,
  deleteSupplierController,
  getSupplierController,
  listSuppliersController,
  updateSupplierController,
} from "./suppliers.controller";
import { createSupplierSchema, supplierQuerySchema, updateSupplierSchema } from "./suppliers.validation";

export const suppliersRouter = Router();

suppliersRouter.use(authenticate, requireOrganizationContext);

suppliersRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: supplierQuerySchema }), asyncHandler(listSuppliersController));
suppliersRouter.post("/", requireRoles(...MANAGER_ROLES), validateRequest({ body: createSupplierSchema }), asyncHandler(createSupplierController));
suppliersRouter.get("/:id", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(getSupplierController));
suppliersRouter.patch("/:id", requireRoles(...MANAGER_ROLES), validateRequest({ body: updateSupplierSchema }), asyncHandler(updateSupplierController));
suppliersRouter.delete("/:id", requireRoles(...MANAGER_ROLES), asyncHandler(deleteSupplierController));
