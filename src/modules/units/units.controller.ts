import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { createUnit, listUnits } from "./units.service";

export async function listUnitsController(req: Request, res: Response) {
  const data = await listUnits(req.auth!.activeOrganizationId!, req.query as never);
  return sendSuccess(res, 200, "Units fetched successfully", data);
}

export async function createUnitController(req: Request, res: Response) {
  const data = await createUnit(req.auth!.activeOrganizationId!, req.auth!.userId, req.body);
  return sendSuccess(res, 201, "Unit created successfully", data);
}
