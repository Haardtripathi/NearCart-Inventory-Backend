import type { Request, Response } from "express";
import { UserRole } from "@prisma/client";

import { sendSuccess } from "../../utils/ApiResponse";
import { getRequestMeta } from "../../utils/request";
import {
  bootstrapSuperAdmin,
  changePassword,
  completeAccountSetup,
  getMe,
  login,
  registerOrganizationOwner,
  resetPasswordWithToken,
  updateMyPreferences,
} from "./auth.service";

export async function bootstrapSuperAdminController(req: Request, res: Response) {
  const user = await bootstrapSuperAdmin(req.body, getRequestMeta(req));
  return sendSuccess(res, 201, "Super admin bootstrapped successfully", user);
}

export async function loginController(req: Request, res: Response) {
  const data = await login(req.body, getRequestMeta(req));
  return sendSuccess(res, 200, "Login successful", data);
}

export async function registerOrganizationOwnerController(req: Request, res: Response) {
  const data = await registerOrganizationOwner(req.body, getRequestMeta(req));
  return sendSuccess(res, 201, "Organization owner registered successfully", data);
}

export async function completeAccountSetupController(req: Request, res: Response) {
  const data = await completeAccountSetup(req.body, getRequestMeta(req));
  return sendSuccess(res, 200, "Account setup completed successfully", data);
}

export async function resetPasswordController(req: Request, res: Response) {
  const data = await resetPasswordWithToken(req.body, getRequestMeta(req));
  return sendSuccess(res, 200, "Password reset successfully", data);
}

export async function changePasswordController(req: Request, res: Response) {
  const data = await changePassword(req.auth!.userId, req.body);
  return sendSuccess(res, 200, "Password changed successfully", data);
}

export async function updateMyPreferencesController(req: Request, res: Response) {
  const data = await updateMyPreferences(req.auth!.userId, req.body);
  return sendSuccess(res, 200, "Preferences updated successfully", data);
}

export async function meController(req: Request, res: Response) {
  const requestedOrganizationId =
    req.auth!.role === UserRole.SUPER_ADMIN && typeof req.headers["x-organization-id"] === "string"
      ? req.headers["x-organization-id"]
      : req.auth!.activeOrganizationId;
  const data = await getMe(req.auth!.userId, requestedOrganizationId, req.auth!.role);
  return sendSuccess(res, 200, "Authenticated user fetched successfully", data);
}
