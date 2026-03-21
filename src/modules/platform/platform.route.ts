import { Router } from "express";
import { UserRole } from "@prisma/client";

import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { createIndustryController, getIndustriesController, updateIndustryController } from "./platform.controller";
import { createIndustrySchema, industriesQuerySchema, updateIndustrySchema } from "./platform.validation";

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
