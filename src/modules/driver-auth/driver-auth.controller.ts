import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import {
  DriverStatusError,
  loginDriver,
  logoutDriver,
  refreshDriverSession,
  registerDriver,
  sendDriverEmailVerificationOtp,
  verifyDriverEmailVerificationOtp,
} from "./driver-auth.service";

/**
 * Deliberately NOT using sendSuccess()'s `{success,message,data}` envelope here — the driver API
 * contract in PHASE1_REQUIREMENTS.md locks these two responses to flat top-level shapes
 * (`{ driver }` / `{ token, driver }` / `{ error: { code, message } }`) since the driver mobile
 * app is built against that exact contract. Every other driver/platform/org endpoint in this
 * backend uses the normal envelope.
 */
export async function registerDriverController(req: Request, res: Response) {
  const driver = await registerDriver(req.body);
  return res.status(201).json({ driver });
}

export async function loginDriverController(req: Request, res: Response) {
  try {
    const data = await loginDriver(req.body);
    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof DriverStatusError) {
      return res.status(403).json({ error: { code: error.code, message: error.message } });
    }

    throw error;
  }
}

export async function refreshDriverTokenController(req: Request, res: Response) {
  try {
    const data = await refreshDriverSession(req.body.refreshToken);
    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof DriverStatusError) {
      return res.status(403).json({ error: { code: error.code, message: error.message } });
    }

    throw error;
  }
}

export async function logoutDriverController(req: Request, res: Response) {
  await logoutDriver(req.body.refreshToken);
  return res.status(200).json({ success: true });
}

/**
 * These two OTP endpoints are NOT part of PHASE1_REQUIREMENTS.md's locked flat-shape driver
 * contract (that only covers register/login/refresh/logout) — they're new, so they use this
 * backend's normal `sendSuccess()` `{success,message,data}` envelope, same as the equivalent
 * `User` endpoints (auth.controller.ts's sendEmailOtpController/verifyEmailOtpController).
 */
export async function sendDriverEmailOtpController(req: Request, res: Response) {
  const data = await sendDriverEmailVerificationOtp(req.body);
  return sendSuccess(res, 200, "If this email exists, a verification code has been sent", data);
}

export async function verifyDriverEmailOtpController(req: Request, res: Response) {
  const data = await verifyDriverEmailVerificationOtp(req.body);
  return sendSuccess(res, 200, "Email verified successfully", data);
}
