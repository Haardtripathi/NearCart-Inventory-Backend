"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDriverController = registerDriverController;
exports.loginDriverController = loginDriverController;
exports.refreshDriverTokenController = refreshDriverTokenController;
exports.logoutDriverController = logoutDriverController;
exports.sendDriverEmailOtpController = sendDriverEmailOtpController;
exports.verifyDriverEmailOtpController = verifyDriverEmailOtpController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const driver_auth_service_1 = require("./driver-auth.service");
/**
 * Deliberately NOT using sendSuccess()'s `{success,message,data}` envelope here — the driver API
 * contract in PHASE1_REQUIREMENTS.md locks these two responses to flat top-level shapes
 * (`{ driver }` / `{ token, driver }` / `{ error: { code, message } }`) since the driver mobile
 * app is built against that exact contract. Every other driver/platform/org endpoint in this
 * backend uses the normal envelope.
 */
async function registerDriverController(req, res) {
    const driver = await (0, driver_auth_service_1.registerDriver)(req.body);
    return res.status(201).json({ driver });
}
async function loginDriverController(req, res) {
    try {
        const data = await (0, driver_auth_service_1.loginDriver)(req.body);
        return res.status(200).json(data);
    }
    catch (error) {
        if (error instanceof driver_auth_service_1.DriverStatusError) {
            return res.status(403).json({ error: { code: error.code, message: error.message } });
        }
        throw error;
    }
}
async function refreshDriverTokenController(req, res) {
    try {
        const data = await (0, driver_auth_service_1.refreshDriverSession)(req.body.refreshToken);
        return res.status(200).json(data);
    }
    catch (error) {
        if (error instanceof driver_auth_service_1.DriverStatusError) {
            return res.status(403).json({ error: { code: error.code, message: error.message } });
        }
        throw error;
    }
}
async function logoutDriverController(req, res) {
    await (0, driver_auth_service_1.logoutDriver)(req.body.refreshToken);
    return res.status(200).json({ success: true });
}
/**
 * These two OTP endpoints are NOT part of PHASE1_REQUIREMENTS.md's locked flat-shape driver
 * contract (that only covers register/login/refresh/logout) — they're new, so they use this
 * backend's normal `sendSuccess()` `{success,message,data}` envelope, same as the equivalent
 * `User` endpoints (auth.controller.ts's sendEmailOtpController/verifyEmailOtpController).
 */
async function sendDriverEmailOtpController(req, res) {
    const data = await (0, driver_auth_service_1.sendDriverEmailVerificationOtp)(req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "If this email exists, a verification code has been sent", data);
}
async function verifyDriverEmailOtpController(req, res) {
    const data = await (0, driver_auth_service_1.verifyDriverEmailVerificationOtp)(req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Email verified successfully", data);
}
