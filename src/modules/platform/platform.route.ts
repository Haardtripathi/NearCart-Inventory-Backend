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
