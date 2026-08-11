import type { Request, Response } from "express";

import { assertBranchAccessOrThrow, resolveBranchFilter } from "../../utils/branchAccess";
import { sendSuccess } from "../../utils/ApiResponse";
import {
  createPurchase,
  getPurchaseById,
  listPurchases,
  postPurchase,
  updatePurchase,
} from "./purchases.service";

// See the equivalent helper in sales-orders.controller.ts — same reasoning: the purchase's
// branchId isn't known until it's loaded, so every single-purchase action loads it first and
// checks branch access against its actual branchId.
async function assertCanAccessPurchase(req: Request, organizationId: string, purchaseId: string) {
  const purchase = await getPurchaseById(organizationId, purchaseId);
  assertBranchAccessOrThrow(req.membership?.branchAccess, purchase.branchId);
  return purchase;
}

export async function listPurchasesController(req: Request, res: Response) {
  const branchId = resolveBranchFilter(req.membership?.branchAccess, (req.query as { branchId?: string }).branchId);
  const data = await listPurchases(req.auth!.activeOrganizationId!, { ...req.query, branchId } as never);
  return sendSuccess(res, 200, "Purchase receipts fetched successfully", data);
}

export async function createPurchaseController(req: Request, res: Response) {
  assertBranchAccessOrThrow(req.membership?.branchAccess, req.body.branchId);
  const data = await createPurchase(req.auth!.activeOrganizationId!, req.auth!.userId, req.body);
  return sendSuccess(res, 201, "Purchase receipt created successfully", data);
}

export async function getPurchaseController(req: Request, res: Response) {
  const data = await assertCanAccessPurchase(req, req.auth!.activeOrganizationId!, req.params.id!);
  return sendSuccess(res, 200, "Purchase receipt fetched successfully", data);
}

export async function updatePurchaseController(req: Request, res: Response) {
  await assertCanAccessPurchase(req, req.auth!.activeOrganizationId!, req.params.id!);
  if (req.body.branchId) {
    assertBranchAccessOrThrow(req.membership?.branchAccess, req.body.branchId);
  }
  const data = await updatePurchase(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId, req.body);
  return sendSuccess(res, 200, "Purchase receipt updated successfully", data);
}

export async function postPurchaseController(req: Request, res: Response) {
  await assertCanAccessPurchase(req, req.auth!.activeOrganizationId!, req.params.id!);
  const data = await postPurchase(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Purchase receipt posted successfully", data);
}
