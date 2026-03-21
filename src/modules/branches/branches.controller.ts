import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext } from "../../utils/localization";
import { createBranch, deleteBranch, getBranchById, listBranches, updateBranch } from "./branches.service";

export async function listBranchesController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await listBranches(req.auth!.activeOrganizationId!, req.query as never, localeContext);
  return sendSuccess(res, 200, "Branches fetched successfully", data);
}

export async function createBranchController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await createBranch(req.auth!.activeOrganizationId!, req.body, localeContext);
  return sendSuccess(res, 201, "Branch created successfully", data);
}

export async function getBranchController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getBranchById(req.auth!.activeOrganizationId!, req.params.id!, localeContext);
  return sendSuccess(res, 200, "Branch fetched successfully", data);
}

export async function updateBranchController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await updateBranch(req.auth!.activeOrganizationId!, req.params.id!, req.body, localeContext);
  return sendSuccess(res, 200, "Branch updated successfully", data);
}

export async function deleteBranchController(req: Request, res: Response) {
  const data = await deleteBranch(req.auth!.activeOrganizationId!, req.params.id!);
  return sendSuccess(res, 200, "Branch deleted successfully", data);
}
