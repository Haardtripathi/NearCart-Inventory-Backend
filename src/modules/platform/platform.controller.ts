import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext } from "../../utils/localization";
import { createIndustry, listIndustries, updateIndustry } from "./platform.service";

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
