import { Router } from "express";
import { UserRole } from "@prisma/client";

import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  deliverDriverOrderController,
  listDriverOrdersController,
  pickupDriverOrderController,
} from "./driver.controller";

export const driverRouter = Router();

// Drivers reuse the same User + JWT login (POST /auth/login) as every other role — no separate
// driver auth system — and the same OrganizationMembership.role gate as the rest of the app.
driverRouter.use(authenticate, requireOrganizationContext, requireRoles(UserRole.DRIVER));

driverRouter.get("/orders", asyncHandler(listDriverOrdersController));
driverRouter.post("/orders/:id/pickup", asyncHandler(pickupDriverOrderController));
driverRouter.post("/orders/:id/deliver", asyncHandler(deliverDriverOrderController));
