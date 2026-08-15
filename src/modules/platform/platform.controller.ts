import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext } from "../../utils/localization";
import {
  createIndustry,
  listIndustries,
  listPlatformDrivers,
  listPlatformOrganizations,
  suspendPlatformDriver,
  updateIndustry,
  verifyPlatformDriver,
} from "./platform.service";

export async function getIndustriesController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await listIndustries(localeContext);
  return sendSuccess(res, 200, "Industries fetched successfully", data);
}

export async function createIndustryController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await createIndustry(req.body, localeContext);
  return sendSuccess(res, 201, "Industry created successfully", data);
}

export async function updateIndustryController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await updateIndustry(req.params.id!, req.body, localeContext);
  return sendSuccess(res, 200, "Industry updated successfully", data);
}

export async function getPlatformOrganizationsController(_req: Request, res: Response) {
  const data = await listPlatformOrganizations();
  return sendSuccess(res, 200, "Organizations fetched successfully", data);
}

export async function getPlatformDriversController(req: Request, res: Response) {
  const data = await listPlatformDrivers(req.query as never);
  return sendSuccess(res, 200, "Drivers fetched successfully", data);
}

export async function verifyPlatformDriverController(req: Request, res: Response) {
  const data = await verifyPlatformDriver(req.auth!.userId, req.params.id!);
  return sendSuccess(res, 200, "Driver verified successfully", data);
}

export async function suspendPlatformDriverController(req: Request, res: Response) {
  const data = await suspendPlatformDriver(req.auth!.userId, req.params.id!);
  return sendSuccess(res, 200, "Driver suspended successfully", data);
}
