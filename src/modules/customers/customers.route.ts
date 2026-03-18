import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createCustomerController,
  deleteCustomerController,
  getCustomerController,
  listCustomersController,
  updateCustomerController,
} from "./customers.controller";
import { createCustomerSchema, customerQuerySchema, updateCustomerSchema } from "./customers.validation";

export const customersRouter = Router();

customersRouter.use(authenticate, requireOrganizationContext);

customersRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: customerQuerySchema }), asyncHandler(listCustomersController));
customersRouter.post("/", requireRoles(...MANAGER_ROLES), validateRequest({ body: createCustomerSchema }), asyncHandler(createCustomerController));
customersRouter.get("/:id", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(getCustomerController));
customersRouter.patch("/:id", requireRoles(...MANAGER_ROLES), validateRequest({ body: updateCustomerSchema }), asyncHandler(updateCustomerController));
customersRouter.delete("/:id", requireRoles(...MANAGER_ROLES), asyncHandler(deleteCustomerController));
