import { Router } from "express";

import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  loginDriverController,
  logoutDriverController,
  refreshDriverTokenController,
  registerDriverController,
  sendDriverEmailOtpController,
  verifyDriverEmailOtpController,
} from "./driver-auth.controller";
import {
  loginDriverSchema,
  logoutDriverSchema,
  refreshDriverTokenSchema,
  registerDriverSchema,
  sendDriverEmailOtpSchema,
  verifyDriverEmailOtpSchema,
} from "./driver-auth.validation";

export const driverAuthRouter = Router();

driverAuthRouter.post(
  "/register",
  validateRequest({ body: registerDriverSchema }),
  asyncHandler(registerDriverController),
);
driverAuthRouter.post("/login", validateRequest({ body: loginDriverSchema }), asyncHandler(loginDriverController));
driverAuthRouter.post(
  "/refresh",
  validateRequest({ body: refreshDriverTokenSchema }),
  asyncHandler(refreshDriverTokenController),
);
driverAuthRouter.post(
  "/logout",
  validateRequest({ body: logoutDriverSchema }),
  asyncHandler(logoutDriverController),
);
// Email OTP verification — an ADDITIONAL trust signal alongside (not a replacement for) the
// admin manual-review gate above. Deliberately unauthenticated (identify the driver by `email` in
// the body, same as auth.route.ts's /auth/send-otp + /auth/verify-otp for `User`) since a
// PENDING_VERIFICATION driver has no token to authenticate with yet — see the design-decision
// comment on sendDriverEmailVerificationOtp in driver-auth.service.ts.
driverAuthRouter.post(
  "/otp/send",
  validateRequest({ body: sendDriverEmailOtpSchema }),
  asyncHandler(sendDriverEmailOtpController),
);
driverAuthRouter.post(
  "/otp/verify",
  validateRequest({ body: verifyDriverEmailOtpSchema }),
  asyncHandler(verifyDriverEmailOtpController),
);
