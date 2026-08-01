import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  bootstrapSuperAdminController,
  changePasswordController,
  completeAccountSetupController,
  loginController,
  logoutController,
  meController,
  registerOrganizationOwnerController,
  resetPasswordController,
  sendEmailOtpController,
  updateMyPreferencesController,
  verifyEmailOtpController,
} from "./auth.controller";
import {
  bootstrapSuperAdminSchema,
  changePasswordSchema,
  completeAccountSetupSchema,
  loginSchema,
  registerOrganizationOwnerSchema,
  resetPasswordSchema,
  sendEmailOtpSchema,
  updateMyPreferencesSchema,
  verifyEmailOtpSchema,
} from "./auth.validation";

export const authRouter = Router();

authRouter.post(
  "/bootstrap-super-admin",
  validateRequest({ body: bootstrapSuperAdminSchema }),
  asyncHandler(bootstrapSuperAdminController),
);
authRouter.post("/login", validateRequest({ body: loginSchema }), asyncHandler(loginController));
authRouter.post(
  "/register-organization-owner",
  validateRequest({ body: registerOrganizationOwnerSchema }),
  asyncHandler(registerOrganizationOwnerController),
);
authRouter.post(
  "/complete-account-setup",
  validateRequest({ body: completeAccountSetupSchema }),
  asyncHandler(completeAccountSetupController),
);
authRouter.post("/reset-password", validateRequest({ body: resetPasswordSchema }), asyncHandler(resetPasswordController));
authRouter.post("/send-otp", validateRequest({ body: sendEmailOtpSchema }), asyncHandler(sendEmailOtpController));
authRouter.post("/verify-otp", validateRequest({ body: verifyEmailOtpSchema }), asyncHandler(verifyEmailOtpController));
authRouter.post("/logout", authenticate, asyncHandler(logoutController));
authRouter.get("/me", authenticate, asyncHandler(meController));
authRouter.patch(
  "/me/preferences",
  authenticate,
  validateRequest({ body: updateMyPreferencesSchema }),
  asyncHandler(updateMyPreferencesController),
);
authRouter.post(
  "/change-password",
  authenticate,
  validateRequest({ body: changePasswordSchema }),
  asyncHandler(changePasswordController),
);
