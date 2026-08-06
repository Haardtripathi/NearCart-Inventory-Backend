import { Router } from "express";

import { READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../utils/validation";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  listNotificationLogsController,
  markAllNotificationsReadController,
  markNotificationReadController,
} from "./notifications.controller";
import { notificationLogQuerySchema } from "./notifications.validation";

export const notificationsRouter = Router();

notificationsRouter.use(authenticate, requireOrganizationContext, requireRoles(...READ_WRITE_STAFF_ROLES));

notificationsRouter.get(
  "/",
  validateRequest({ query: notificationLogQuerySchema }),
  asyncHandler(listNotificationLogsController),
);

notificationsRouter.patch(
  "/read-all",
  asyncHandler(markAllNotificationsReadController),
);

notificationsRouter.patch(
  "/:id/read",
  validateRequest({ params: idParamSchema }),
  asyncHandler(markNotificationReadController),
);
