import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { createAdjustment, listBalances, listLedger } from "./inventory.service";

export async function getBalancesController(req: Request, res: Response) {
  const data = await listBalances(req.auth!.activeOrganizationId!, req.query as never);
  return sendSuccess(res, 200, "Inventory balances fetched successfully", data);
}

export async function getLedgerController(req: Request, res: Response) {
  const data = await listLedger(req.auth!.activeOrganizationId!, req.query as never);
  return sendSuccess(res, 200, "Inventory ledger fetched successfully", data);
}

export async function createAdjustmentController(req: Request, res: Response) {
  const data = await createAdjustment(req.auth!.activeOrganizationId!, req.auth!.userId, req.body);
  return sendSuccess(res, 201, "Inventory adjustment posted successfully", data);
}
