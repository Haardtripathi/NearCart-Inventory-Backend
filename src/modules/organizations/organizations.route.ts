import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createOrganizationController,
  getMyOrganizationsController,
  getOrganizationByIdController,
} from "./organizations.controller";
import { createOrganizationSchema } from "./organizations.validation";

export const organizationsRouter = Router();

organizationsRouter.use(authenticate);

organizationsRouter.post("/", validateRequest({ body: createOrganizationSchema }), asyncHandler(createOrganizationController));
organizationsRouter.get("/my", asyncHandler(getMyOrganizationsController));
organizationsRouter.get("/:id", asyncHandler(getOrganizationByIdController));
