import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  cancelSalesOrderController,
  confirmSalesOrderController,
  createSalesOrderController,
  deliverSalesOrderController,
  getSalesOrderController,
  listSalesOrdersController,
  rejectSalesOrderController,
  updateSalesOrderController,
} from "./sales-orders.controller";
import {
  createSalesOrderSchema,
  rejectSalesOrderSchema,
  salesOrderQuerySchema,
  updateSalesOrderSchema,
} from "./sales-orders.validation";

export const salesOrdersRouter = Router();

salesOrdersRouter.use(authenticate, requireOrganizationContext);

salesOrdersRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: salesOrderQuerySchema }), asyncHandler(listSalesOrdersController));
salesOrdersRouter.post("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ body: createSalesOrderSchema }), asyncHandler(createSalesOrderController));
salesOrdersRouter.get("/:id", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(getSalesOrderController));
salesOrdersRouter.patch("/:id", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ body: updateSalesOrderSchema }), asyncHandler(updateSalesOrderController));
salesOrdersRouter.post("/:id/confirm", requireRoles(...MANAGER_ROLES), asyncHandler(confirmSalesOrderController));
salesOrdersRouter.post("/:id/reject", requireRoles(...MANAGER_ROLES), validateRequest({ body: rejectSalesOrderSchema }), asyncHandler(rejectSalesOrderController));
salesOrdersRouter.post("/:id/cancel", requireRoles(...MANAGER_ROLES), asyncHandler(cancelSalesOrderController));
salesOrdersRouter.post("/:id/deliver", requireRoles(...MANAGER_ROLES), asyncHandler(deliverSalesOrderController));
