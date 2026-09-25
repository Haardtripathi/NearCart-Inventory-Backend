import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { assertBranchAccessOrThrow, normalizeBranchAccess } from "../../utils/branchAccess";
import { createDriverShopCode, listShopDrivers, removeShopDriver } from "./driver-shop.service";
import { listAssignableDrivers } from "./drivers.service";

export async function listAssignableDriversController(req: Request, res: Response) {
  const data = await listAssignableDrivers(req.query as never, req.auth!.activeOrganizationId!);
  return sendSuccess(res, 200, "Drivers fetched successfully", data);
}

export async function createDriverShopCodeController(req: Request, res: Response) {
  assertBranchAccessOrThrow(req.membership?.branchAccess, req.body.branchId);
  const data = await createDriverShopCode(req.auth!.activeOrganizationId!, req.body.branchId, req.auth!.userId);
  return sendSuccess(res, 201, "Store code created", data);
}

export async function listShopDriversController(req: Request, res: Response) {
  const branchId = (req.query as { branchId?: string }).branchId;
  if (branchId) {
    assertBranchAccessOrThrow(req.membership?.branchAccess, branchId);
  }
  const normalized = req.membership ? normalizeBranchAccess(req.membership.branchAccess) : null;
  const branchIds = branchId ? [branchId] : normalized?.scope === "SELECTED" ? normalized.branchIds : undefined;
  const data = await listShopDrivers(req.auth!.activeOrganizationId!, branchIds);
  return sendSuccess(res, 200, "Shop drivers fetched successfully", data);
}

export async function removeShopDriverController(req: Request, res: Response) {
  const data = await removeShopDriver(req.auth!.activeOrganizationId!, req.params.driverId!, req.auth!.userId, (branchId) =>
    assertBranchAccessOrThrow(req.membership?.branchAccess, branchId),
  );
  return sendSuccess(res, 200, "Driver removed from your shop", data);
}
