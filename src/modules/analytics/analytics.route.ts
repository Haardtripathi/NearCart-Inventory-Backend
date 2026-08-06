import { Router } from "express";

import { READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAnalyticsOverviewController, getReorderSuggestionsController } from "./analytics.controller";
import { analyticsOverviewQuerySchema } from "./analytics.validation";

export const analyticsRouter = Router();

analyticsRouter.use(authenticate, requireOrganizationContext);

analyticsRouter.get(
  "/overview",
  requireRoles(...READ_WRITE_STAFF_ROLES),
  validateRequest({ query: analyticsOverviewQuerySchema }),
  asyncHandler(getAnalyticsOverviewController),
);

analyticsRouter.get(
  "/reorder-suggestions",
  requireRoles(...READ_WRITE_STAFF_ROLES),
  validateRequest({ query: analyticsOverviewQuerySchema }),
  asyncHandler(getReorderSuggestionsController),
);
