import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { getShopStatus, updateShopStatus } from "./shop-status.service";

export async function getShopStatusController(req: Request, res: Response) {
  const data = await getShopStatus(
    req.auth!.activeOrganizationId!,
    req.membership?.branchAccess,
    (req.query as { branchId?: string }).branchId,
  );
  return sendSuccess(res, 200, "Shop status fetched successfully", data);
}

export async function updateShopStatusController(req: Request, res: Response) {
  const data = await updateShopStatus(
    req.auth!.activeOrganizationId!,
    req.auth!.userId,
    req.membership?.branchAccess,
    req.body,
  );
  return sendSuccess(res, 200, req.body.isOpen ? "Shop marked open for today" : "Shop marked closed for today", data);
}
