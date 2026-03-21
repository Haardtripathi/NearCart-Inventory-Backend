import { Router } from "express";
import { UserRole } from "@prisma/client";

import { USER_MANAGEMENT_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { idParamSchema } from "../../utils/validation";
import {
  createOrganizationUserController,
  generateOrganizationUserAccessLinkController,
  listOrganizationUsersController,
  searchUsersDirectoryController,
  updateOrganizationUserController,
} from "./users.controller";
import {
  createOrganizationUserSchema,
  updateOrganizationUserSchema,
  usersDirectoryQuerySchema,
} from "./users.validation";

export const usersRouter = Router();

usersRouter.use(authenticate);

usersRouter.get(
  "/directory",
  requireRoles(UserRole.SUPER_ADMIN),
  validateRequest({ query: usersDirectoryQuerySchema }),
  asyncHandler(searchUsersDirectoryController),
);

usersRouter.get("/", requireOrganizationContext, requireRoles(...USER_MANAGEMENT_ROLES), asyncHandler(listOrganizationUsersController));
usersRouter.post(
  "/",
  requireOrganizationContext,
  requireRoles(...USER_MANAGEMENT_ROLES),
  validateRequest({ body: createOrganizationUserSchema }),
  asyncHandler(createOrganizationUserController),
);
usersRouter.patch(
  "/:id",
  requireOrganizationContext,
  requireRoles(...USER_MANAGEMENT_ROLES),
  validateRequest({ params: idParamSchema, body: updateOrganizationUserSchema }),
  asyncHandler(updateOrganizationUserController),
);
usersRouter.post(
  "/:id/access-link",
  requireOrganizationContext,
  requireRoles(...USER_MANAGEMENT_ROLES),
  validateRequest({ params: idParamSchema }),
  asyncHandler(generateOrganizationUserAccessLinkController),
);
