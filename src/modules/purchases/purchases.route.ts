import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createPurchaseController,
  getPurchaseController,
  listPurchasesController,
  postPurchaseController,
  updatePurchaseController,
} from "./purchases.controller";
import { createPurchaseSchema, purchaseQuerySchema, updatePurchaseSchema } from "./purchases.validation";

export const purchasesRouter = Router();

purchasesRouter.use(authenticate, requireOrganizationContext);

purchasesRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: purchaseQuerySchema }), asyncHandler(listPurchasesController));
purchasesRouter.post("/", requireRoles(...MANAGER_ROLES), validateRequest({ body: createPurchaseSchema }), asyncHandler(createPurchaseController));
purchasesRouter.get("/:id", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(getPurchaseController));
purchasesRouter.patch("/:id", requireRoles(...MANAGER_ROLES), validateRequest({ body: updatePurchaseSchema }), asyncHandler(updatePurchaseController));
purchasesRouter.post("/:id/post", requireRoles(...MANAGER_ROLES), asyncHandler(postPurchaseController));
