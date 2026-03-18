import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  approveStockTransferController,
  cancelStockTransferController,
  createStockTransferController,
  getStockTransferController,
  listStockTransfersController,
  updateStockTransferController,
} from "./stock-transfers.controller";
import {
  createStockTransferSchema,
  stockTransferQuerySchema,
  updateStockTransferSchema,
} from "./stock-transfers.validation";

export const stockTransfersRouter = Router();

stockTransfersRouter.use(authenticate, requireOrganizationContext);

stockTransfersRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: stockTransferQuerySchema }), asyncHandler(listStockTransfersController));
stockTransfersRouter.post("/", requireRoles(...MANAGER_ROLES), validateRequest({ body: createStockTransferSchema }), asyncHandler(createStockTransferController));
stockTransfersRouter.get("/:id", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(getStockTransferController));
stockTransfersRouter.patch("/:id", requireRoles(...MANAGER_ROLES), validateRequest({ body: updateStockTransferSchema }), asyncHandler(updateStockTransferController));
stockTransfersRouter.post("/:id/approve", requireRoles(...MANAGER_ROLES), asyncHandler(approveStockTransferController));
stockTransfersRouter.post("/:id/cancel", requireRoles(...MANAGER_ROLES), asyncHandler(cancelStockTransferController));
