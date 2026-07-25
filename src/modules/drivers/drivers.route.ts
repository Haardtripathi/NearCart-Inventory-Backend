import { Router } from "express";

import { MANAGER_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { listAssignableDriversController } from "./drivers.controller";
import { listAssignableDriversQuerySchema } from "./drivers.validation";

export const driversRouter = Router();

driversRouter.use(authenticate, requireOrganizationContext);

driversRouter.get(
  "/",
  requireRoles(...MANAGER_ROLES),
  validateRequest({ query: listAssignableDriversQuerySchema }),
  asyncHandler(listAssignableDriversController),
);
