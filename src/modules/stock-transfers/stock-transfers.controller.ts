import type { Request, Response } from "express";

import { assertBranchAccessOrThrow, normalizeBranchAccess } from "../../utils/branchAccess";
import { sendSuccess } from "../../utils/ApiResponse";
import {
  approveStockTransfer,
  cancelStockTransfer,
  createStockTransfer,
  getStockTransferById,
  listStockTransfers,
  updateStockTransfer,
} from "./stock-transfers.service";

// A transfer touches two branches at once, so both ends are checked — a branch-scoped caller
// must have access to both the source and destination, not just one, to see or act on it.
async function assertCanAccessTransfer(req: Request, organizationId: string, transferId: string) {
  const transfer = await getStockTransferById(organizationId, transferId);
  assertBranchAccessOrThrow(req.membership?.branchAccess, transfer.fromBranchId);
  assertBranchAccessOrThrow(req.membership?.branchAccess, transfer.toBranchId);
  return transfer;
}

export async function listStockTransfersController(req: Request, res: Response) {
  const query = req.query as { fromBranchId?: string; toBranchId?: string };

  if (query.fromBranchId) {
    assertBranchAccessOrThrow(req.membership?.branchAccess, query.fromBranchId);
  }
  if (query.toBranchId) {
    assertBranchAccessOrThrow(req.membership?.branchAccess, query.toBranchId);
  }

  const normalized = req.membership ? normalizeBranchAccess(req.membership.branchAccess) : null;
  const accessibleBranchIds = normalized?.scope === "SELECTED" ? normalized.branchIds : undefined;

  const data = await listStockTransfers(req.auth!.activeOrganizationId!, { ...req.query, accessibleBranchIds } as never);
  return sendSuccess(res, 200, "Stock transfers fetched successfully", data);
}

export async function createStockTransferController(req: Request, res: Response) {
  assertBranchAccessOrThrow(req.membership?.branchAccess, req.body.fromBranchId);
  assertBranchAccessOrThrow(req.membership?.branchAccess, req.body.toBranchId);
  const data = await createStockTransfer(req.auth!.activeOrganizationId!, req.auth!.userId, req.body);
  return sendSuccess(res, 201, "Stock transfer created successfully", data);
}

export async function getStockTransferController(req: Request, res: Response) {
  const data = await assertCanAccessTransfer(req, req.auth!.activeOrganizationId!, req.params.id!);
  return sendSuccess(res, 200, "Stock transfer fetched successfully", data);
}

export async function updateStockTransferController(req: Request, res: Response) {
  await assertCanAccessTransfer(req, req.auth!.activeOrganizationId!, req.params.id!);
  if (req.body.fromBranchId) {
    assertBranchAccessOrThrow(req.membership?.branchAccess, req.body.fromBranchId);
  }
  if (req.body.toBranchId) {
    assertBranchAccessOrThrow(req.membership?.branchAccess, req.body.toBranchId);
  }
  const data = await updateStockTransfer(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId, req.body);
  return sendSuccess(res, 200, "Stock transfer updated successfully", data);
}

export async function approveStockTransferController(req: Request, res: Response) {
  await assertCanAccessTransfer(req, req.auth!.activeOrganizationId!, req.params.id!);
  const data = await approveStockTransfer(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Stock transfer approved successfully", data);
}

export async function cancelStockTransferController(req: Request, res: Response) {
  await assertCanAccessTransfer(req, req.auth!.activeOrganizationId!, req.params.id!);
  const data = await cancelStockTransfer(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Stock transfer cancelled successfully", data);
}
