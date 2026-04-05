import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext } from "../../utils/localization";
import {
  addIndustryToOrganization,
  createOrganization,
  getMyOrganizations,
  getOrganizationById,
} from "./organizations.service";

export async function createOrganizationController(req: Request, res: Response) {
  const data = await createOrganization(req.auth!.userId, req.auth!.role, req.body);
  return sendSuccess(res, 201, "Organization created successfully", data);
}

export async function getMyOrganizationsController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getMyOrganizations(req.auth!.userId, req.auth!.role, localeContext);
  return sendSuccess(res, 200, "Organizations fetched successfully", data);
}

export async function getOrganizationByIdController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getOrganizationById(req.auth!.userId, req.auth!.role, req.params.id!, localeContext);
  return sendSuccess(res, 200, "Organization fetched successfully", data);
}

export async function addIndustryToOrganizationController(req: Request, res: Response) {
  const data = await addIndustryToOrganization(req.auth!.userId, req.auth!.role, req.params.id!, req.body);
  return sendSuccess(res, 201, "Industry enabled for organization successfully", data);
}
