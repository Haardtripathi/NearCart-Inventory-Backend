import { Router } from "express";

import { ADMIN_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuditLogs } from "./audit.controller";
import { auditLogQuerySchema } from "./audit.validation";

export const auditRouter = Router();

auditRouter.get(
  "/",
  authenticate,
  requireOrganizationContext,
  requireRoles(...ADMIN_ROLES),
  validateRequest({ query: auditLogQuerySchema }),
  asyncHandler(getAuditLogs),
);
