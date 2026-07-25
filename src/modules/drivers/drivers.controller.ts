import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { listAssignableDrivers } from "./drivers.service";

export async function listAssignableDriversController(req: Request, res: Response) {
  const data = await listAssignableDrivers(req.query as never);
  return sendSuccess(res, 200, "Drivers fetched successfully", data);
}
