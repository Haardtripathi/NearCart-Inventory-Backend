import type { Request, Response } from "express";

import { DriverStatusError, loginDriver, registerDriver } from "./driver-auth.service";

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
