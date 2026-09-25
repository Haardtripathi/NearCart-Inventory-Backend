import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  assignDriverToSalesOrderController,
  cancelSalesOrderController,
  confirmSalesOrderController,
  createSalesOrderController,
  deliverSalesOrderController,
  getSalesOrderController,
  listSalesOrdersController,
  dispatchSalesOrderController,
  markSalesOrderReadyController,
  proposePartialFulfilmentController,
  rejectSalesOrderController,
  updateSalesOrderController,
} from "./sales-orders.controller";
import {
  assignDriverSchema,
  dispatchSalesOrderSchema,
  markReadySchema,
  createSalesOrderSchema,
  proposePartialFulfilmentSchema,
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
// Shop-side partial fulfilment: "I can only supply 3 of the 5 things they ordered". Same
// MANAGER_ROLES gate and same branch-access check as confirm/reject, because it is the third
// option in that same decision — and deliberately only available BEFORE confirming. Writes
// nothing but the proposal itself: no stock moves and no item row changes until the customer
// accepts (see sales-orders.service.ts).
salesOrdersRouter.post(
  "/:id/propose-partial",
  requireRoles(...MANAGER_ROLES),
  validateRequest({ body: proposePartialFulfilmentSchema }),
  asyncHandler(proposePartialFulfilmentController),
);
salesOrdersRouter.post("/:id/reject", requireRoles(...MANAGER_ROLES), validateRequest({ body: rejectSalesOrderSchema }), asyncHandler(rejectSalesOrderController));
salesOrdersRouter.post("/:id/cancel", requireRoles(...MANAGER_ROLES), asyncHandler(cancelSalesOrderController));
salesOrdersRouter.post("/:id/deliver", requireRoles(...MANAGER_ROLES), asyncHandler(deliverSalesOrderController));
salesOrdersRouter.patch(
  "/:id/mark-ready",
  requireRoles(...MANAGER_ROLES),
  validateRequest({ body: markReadySchema }),
  asyncHandler(markSalesOrderReadyController),
);
// Re-pick a driver for a packed order that has none (own driver declined, or switch to NearCart).
salesOrdersRouter.post(
  "/:id/dispatch",
  requireRoles(...MANAGER_ROLES),
  validateRequest({ body: dispatchSalesOrderSchema }),
  asyncHandler(dispatchSalesOrderController),
);
salesOrdersRouter.post(
  "/:id/assign-driver",
  requireRoles(...MANAGER_ROLES),
  validateRequest({ body: assignDriverSchema }),
  asyncHandler(assignDriverToSalesOrderController),
);
