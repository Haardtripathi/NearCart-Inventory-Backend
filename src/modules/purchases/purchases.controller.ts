import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import {
  createPurchase,
  getPurchaseById,
  listPurchases,
  postPurchase,
  updatePurchase,
} from "./purchases.service";

export async function listPurchasesController(req: Request, res: Response) {
  const data = await listPurchases(req.auth!.activeOrganizationId!, req.query as never);
  return sendSuccess(res, 200, "Purchase receipts fetched successfully", data);
}

export async function createPurchaseController(req: Request, res: Response) {
  const data = await createPurchase(req.auth!.activeOrganizationId!, req.auth!.userId, req.body);
  return sendSuccess(res, 201, "Purchase receipt created successfully", data);
}

export async function getPurchaseController(req: Request, res: Response) {
  const data = await getPurchaseById(req.auth!.activeOrganizationId!, req.params.id!);
  return sendSuccess(res, 200, "Purchase receipt fetched successfully", data);
}

export async function updatePurchaseController(req: Request, res: Response) {
  const data = await updatePurchase(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId, req.body);
  return sendSuccess(res, 200, "Purchase receipt updated successfully", data);
}

export async function postPurchaseController(req: Request, res: Response) {
  const data = await postPurchase(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Purchase receipt posted successfully", data);
}
