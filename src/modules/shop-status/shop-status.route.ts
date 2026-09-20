import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { getShopStatusController, updateShopStatusController } from "./shop-status.controller";
import { shopStatusQuerySchema, updateShopStatusSchema } from "./shop-status.validation";

export const shopStatusRouter = Router();

shopStatusRouter.use(authenticate, requireOrganizationContext);

// Reading is open to any org member (staff need to see whether the shop is taking orders);
// flipping it is a MANAGER-and-up decision, same bar as confirming/rejecting a sales order.
shopStatusRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: shopStatusQuerySchema }), asyncHandler(getShopStatusController));
shopStatusRouter.patch("/", requireRoles(...MANAGER_ROLES), validateRequest({ body: updateShopStatusSchema }), asyncHandler(updateShopStatusController));
