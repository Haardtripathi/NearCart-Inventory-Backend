"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.driverAuthRouter = void 0;
const express_1 = require("express");
const validate_middleware_1 = require("../../middlewares/validate.middleware");
const asyncHandler_1 = require("../../utils/asyncHandler");
const driver_auth_controller_1 = require("./driver-auth.controller");
const driver_auth_validation_1 = require("./driver-auth.validation");
exports.driverAuthRouter = (0, express_1.Router)();
exports.driverAuthRouter.post("/register", (0, validate_middleware_1.validateRequest)({ body: driver_auth_validation_1.registerDriverSchema }), (0, asyncHandler_1.asyncHandler)(driver_auth_controller_1.registerDriverController));
exports.driverAuthRouter.post("/login", (0, validate_middleware_1.validateRequest)({ body: driver_auth_validation_1.loginDriverSchema }), (0, asyncHandler_1.asyncHandler)(driver_auth_controller_1.loginDriverController));
exports.driverAuthRouter.post("/refresh", (0, validate_middleware_1.validateRequest)({ body: driver_auth_validation_1.refreshDriverTokenSchema }), (0, asyncHandler_1.asyncHandler)(driver_auth_controller_1.refreshDriverTokenController));
exports.driverAuthRouter.post("/logout", (0, validate_middleware_1.validateRequest)({ body: driver_auth_validation_1.logoutDriverSchema }), (0, asyncHandler_1.asyncHandler)(driver_auth_controller_1.logoutDriverController));
// Email OTP verification — an ADDITIONAL trust signal alongside (not a replacement for) the
// admin manual-review gate above. Deliberately unauthenticated (identify the driver by `email` in
// the body, same as auth.route.ts's /auth/send-otp + /auth/verify-otp for `User`) since a
// PENDING_VERIFICATION driver has no token to authenticate with yet — see the design-decision
// comment on sendDriverEmailVerificationOtp in driver-auth.service.ts.
exports.driverAuthRouter.post("/otp/send", (0, validate_middleware_1.validateRequest)({ body: driver_auth_validation_1.sendDriverEmailOtpSchema }), (0, asyncHandler_1.asyncHandler)(driver_auth_controller_1.sendDriverEmailOtpController));
exports.driverAuthRouter.post("/otp/verify", (0, validate_middleware_1.validateRequest)({ body: driver_auth_validation_1.verifyDriverEmailOtpSchema }), (0, asyncHandler_1.asyncHandler)(driver_auth_controller_1.verifyDriverEmailOtpController));
