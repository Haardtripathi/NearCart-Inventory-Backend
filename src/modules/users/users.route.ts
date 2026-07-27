import { Router } from "express";
import { UserRole } from "@prisma/client";

import { USER_MANAGEMENT_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { deviceTokenSchema, idParamSchema } from "../../utils/validation";
import {
  createOrganizationUserController,
  generateOrganizationUserAccessLinkController,
  listOrganizationUsersController,
  registerUserDeviceTokenController,
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

// Not gated behind requireOrganizationContext — a device token belongs to the User account
// itself (push targeting is done per-org via OrganizationMembership lookups at send time, see
// services/push-notification.service.ts sendPushToOrgStaff), not to whichever org happens to be
// active in the request when the app registers its token.
usersRouter.post(
  "/device-token",
  validateRequest({ body: deviceTokenSchema }),
  asyncHandler(registerUserDeviceTokenController),
);

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
