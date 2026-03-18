import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { getRequestMeta } from "../../utils/request";
import { bootstrapSuperAdmin, getMe, login } from "./auth.service";

export async function bootstrapSuperAdminController(req: Request, res: Response) {
  const user = await bootstrapSuperAdmin(req.body, getRequestMeta(req));
  return sendSuccess(res, 201, "Super admin bootstrapped successfully", user);
}

export async function loginController(req: Request, res: Response) {
  const data = await login(req.body, getRequestMeta(req));
  return sendSuccess(res, 200, "Login successful", data);
}

export async function meController(req: Request, res: Response) {
  const data = await getMe(req.auth!.userId, req.auth!.activeOrganizationId, req.auth!.role);
  return sendSuccess(res, 200, "Authenticated user fetched successfully", data);
}
