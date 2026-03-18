import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { createAdjustmentController, getBalancesController, getLedgerController } from "./inventory.controller";
import {
  createAdjustmentSchema,
  inventoryBalanceQuerySchema,
  inventoryLedgerQuerySchema,
} from "./inventory.validation";

export const inventoryRouter = Router();

inventoryRouter.use(authenticate, requireOrganizationContext);

inventoryRouter.get("/balances", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: inventoryBalanceQuerySchema }), asyncHandler(getBalancesController));
inventoryRouter.get("/ledger", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: inventoryLedgerQuerySchema }), asyncHandler(getLedgerController));
inventoryRouter.post("/adjustments", requireRoles(...MANAGER_ROLES), validateRequest({ body: createAdjustmentSchema }), asyncHandler(createAdjustmentController));
