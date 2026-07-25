import { Router } from "express";

import { ADMIN_ROLES } from "../../constants/roles";
import { authenticate, requireEmailVerified, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  addIndustryToOrganizationController,
  createOrganizationController,
  getEnabledPagesController,
  getMyOrganizationsController,
  getOrganizationByIdController,
  updateEnabledPagesController,
} from "./organizations.controller";
import {
  addOrganizationIndustrySchema,
  createOrganizationSchema,
  updateEnabledPagesSchema,
} from "./organizations.validation";

export const organizationsRouter = Router();

organizationsRouter.use(authenticate);

organizationsRouter.post(
  "/",
  requireEmailVerified,
  validateRequest({ body: createOrganizationSchema }),
  asyncHandler(createOrganizationController),
);
organizationsRouter.get("/my", asyncHandler(getMyOrganizationsController));

// Sidebar page-visibility settings for the caller's active organization. Registered before the
// `/:id` routes below so the literal "page-visibility" segment isn't swallowed as an :id param.
organizationsRouter.get(
  "/page-visibility",
  requireOrganizationContext,
  requireRoles(...ADMIN_ROLES),
  asyncHandler(getEnabledPagesController),
);
organizationsRouter.patch(
  "/page-visibility",
  requireOrganizationContext,
  requireRoles(...ADMIN_ROLES),
  validateRequest({ body: updateEnabledPagesSchema }),
  asyncHandler(updateEnabledPagesController),
);

organizationsRouter.post(
  "/:id/industries",
  validateRequest({ body: addOrganizationIndustrySchema }),
  asyncHandler(addIndustryToOrganizationController),
);
organizationsRouter.get("/:id", asyncHandler(getOrganizationByIdController));
