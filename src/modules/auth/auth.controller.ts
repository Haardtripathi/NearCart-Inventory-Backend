import type { Request, Response } from "express";
import { UserRole } from "@prisma/client";

import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext } from "../../utils/localization";
import { getRequestMeta } from "../../utils/request";
import { blacklistToken } from "../../utils/tokenBlacklist";
import {
  bootstrapSuperAdmin,
  changePassword,
  completeAccountSetup,
  getMe,
  login,
  registerOrganizationOwner,
  resetPasswordWithToken,
  sendEmailVerificationOtp,
  updateMyPreferences,
  verifyEmailVerificationOtp,
} from "./auth.service";

export async function bootstrapSuperAdminController(req: Request, res: Response) {
  const user = await bootstrapSuperAdmin(req.body, getRequestMeta(req));
  return sendSuccess(res, 201, "Super admin bootstrapped successfully", user);
}

export async function loginController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await login(req.body, getRequestMeta(req), localeContext);
  return sendSuccess(res, 200, "Login successful", data);
}

export async function registerOrganizationOwnerController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await registerOrganizationOwner(req.body, getRequestMeta(req), localeContext);
  // No session token in `data` — see registerOrganizationOwner in auth.service.ts. The client
  // must verify the email (POST /auth/send-otp + /auth/verify-otp, already sent one) and then
  // call /auth/login to obtain a working session.
  return sendSuccess(res, 201, "Account created. Verify your email to finish setting up your workspace.", data);
}

export async function completeAccountSetupController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await completeAccountSetup(req.body, getRequestMeta(req), localeContext);
  return sendSuccess(res, 200, "Account setup completed successfully", data);
}

export async function resetPasswordController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await resetPasswordWithToken(req.body, getRequestMeta(req), localeContext);
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

export async function sendEmailOtpController(req: Request, res: Response) {
  const data = await sendEmailVerificationOtp(req.body);
  return sendSuccess(res, 200, "If this email exists, a verification code has been sent", data);
}

export async function verifyEmailOtpController(req: Request, res: Response) {
  const data = await verifyEmailVerificationOtp(req.body);
  return sendSuccess(res, 200, "Email verified successfully", data);
}

/**
 * Was a literal no-op (204, nothing else) before this fix — the same access token kept working
 * immediately after "logout" since nothing server-side was tracking issued tokens at all. Now
 * revokes this specific token by jti for its remaining lifetime; see utils/tokenBlacklist.ts.
 */
export async function logoutController(req: Request, res: Response) {
  const remainingTtlSeconds = req.auth!.tokenExpiresAt - Math.floor(Date.now() / 1000);
  await blacklistToken(req.auth!.tokenJti, remainingTtlSeconds);
  res.status(204).send();
}

export async function meController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const requestedOrganizationId =
    req.auth!.role === UserRole.SUPER_ADMIN && typeof req.headers["x-organization-id"] === "string"
      ? req.headers["x-organization-id"]
      : req.auth!.activeOrganizationId;
  const data = await getMe(req.auth!.userId, requestedOrganizationId, req.auth!.role, localeContext);
  return sendSuccess(res, 200, "Authenticated user fetched successfully", data);
}
