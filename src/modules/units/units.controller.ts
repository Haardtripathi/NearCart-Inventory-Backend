import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext } from "../../utils/localization";
import { createUnit, getUnitById, listUnits, updateUnit } from "./units.service";

export async function listUnitsController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await listUnits(req.auth!.activeOrganizationId!, req.query as never, localeContext);
  return sendSuccess(res, 200, "Units fetched successfully", data);
}

export async function createUnitController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await createUnit(req.auth!.activeOrganizationId!, req.auth!.userId, req.body, localeContext);
  return sendSuccess(res, 201, "Unit created successfully", data);
}

export async function getUnitController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getUnitById(req.auth!.activeOrganizationId!, req.params.id!, localeContext);
  return sendSuccess(res, 200, "Unit fetched successfully", data);
}

export async function updateUnitController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await updateUnit(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId, req.body, localeContext);
  return sendSuccess(res, 200, "Unit updated successfully", data);
}
