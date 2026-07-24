import { Router } from "express";

import { authenticate, requireEmailVerified } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  addIndustryToOrganizationController,
  createOrganizationController,
  getMyOrganizationsController,
  getOrganizationByIdController,
} from "./organizations.controller";
import { addOrganizationIndustrySchema, createOrganizationSchema } from "./organizations.validation";

export const organizationsRouter = Router();

organizationsRouter.use(authenticate);

organizationsRouter.post(
  "/",
  requireEmailVerified,
  validateRequest({ body: createOrganizationSchema }),
  asyncHandler(createOrganizationController),
);
organizationsRouter.get("/my", asyncHandler(getMyOrganizationsController));
organizationsRouter.post(
  "/:id/industries",
  validateRequest({ body: addOrganizationIndustrySchema }),
  asyncHandler(addIndustryToOrganizationController),
);
organizationsRouter.get("/:id", asyncHandler(getOrganizationByIdController));
