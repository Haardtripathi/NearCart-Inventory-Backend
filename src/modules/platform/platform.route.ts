import { Router } from "express";
import { UserRole } from "@prisma/client";

import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { idParamSchema } from "../../utils/validation";
import {
  createIndustryController,
  getIndustriesController,
  getPlatformDriversController,
  getPlatformOrganizationsController,
  suspendPlatformDriverController,
  updateIndustryController,
  verifyPlatformDriverController,
} from "./platform.controller";
import {
  createIndustrySchema,
  industriesQuerySchema,
  platformDriversQuerySchema,
  updateIndustrySchema,
} from "./platform.validation";

export const platformRouter = Router();

platformRouter.get("/industries", validateRequest({ query: industriesQuerySchema }), asyncHandler(getIndustriesController));
platformRouter.post(
  "/industries",
  authenticate,
  requireRoles(UserRole.SUPER_ADMIN),
  validateRequest({ body: createIndustrySchema }),
  asyncHandler(createIndustryController),
);
platformRouter.patch(
  "/industries/:id",
  authenticate,
  requireRoles(UserRole.SUPER_ADMIN),
  validateRequest({ body: updateIndustrySchema }),
  asyncHandler(updateIndustryController),
);

// Platform-wide organization list — SUPER_ADMIN only, used both by the web PlatformOrganizations
// page and the mobile app's org-picker for a SUPER_ADMIN (who has no org membership to derive a
// list from). Contract fixed ahead of this endpoint existing — see frontend's
// src/types/platform.ts / src/features/platform/platform.api.ts.
platformRouter.get(
  "/organizations",
  authenticate,
  requireRoles(UserRole.SUPER_ADMIN),
  asyncHandler(getPlatformOrganizationsController),
);

// Platform-admin driver verification — see PHASE1_REQUIREMENTS.md's "Driver API contract".
platformRouter.get(
  "/drivers",
  authenticate,
  requireRoles(UserRole.SUPER_ADMIN),
  validateRequest({ query: platformDriversQuerySchema }),
  asyncHandler(getPlatformDriversController),
);
platformRouter.patch(
  "/drivers/:id/verify",
  authenticate,
  requireRoles(UserRole.SUPER_ADMIN),
  validateRequest({ params: idParamSchema }),
  asyncHandler(verifyPlatformDriverController),
);
platformRouter.patch(
  "/drivers/:id/suspend",
  authenticate,
  requireRoles(UserRole.SUPER_ADMIN),
  validateRequest({ params: idParamSchema }),
  asyncHandler(suspendPlatformDriverController),
);
