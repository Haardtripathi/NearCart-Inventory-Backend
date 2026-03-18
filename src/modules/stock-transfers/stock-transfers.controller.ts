import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import {
  approveStockTransfer,
  cancelStockTransfer,
  createStockTransfer,
  getStockTransferById,
  listStockTransfers,
  updateStockTransfer,
} from "./stock-transfers.service";

export async function listStockTransfersController(req: Request, res: Response) {
  const data = await listStockTransfers(req.auth!.activeOrganizationId!, req.query as never);
  return sendSuccess(res, 200, "Stock transfers fetched successfully", data);
}

export async function createStockTransferController(req: Request, res: Response) {
  const data = await createStockTransfer(req.auth!.activeOrganizationId!, req.auth!.userId, req.body);
  return sendSuccess(res, 201, "Stock transfer created successfully", data);
}

export async function getStockTransferController(req: Request, res: Response) {
  const data = await getStockTransferById(req.auth!.activeOrganizationId!, req.params.id!);
  return sendSuccess(res, 200, "Stock transfer fetched successfully", data);
}

export async function updateStockTransferController(req: Request, res: Response) {
  const data = await updateStockTransfer(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId, req.body);
  return sendSuccess(res, 200, "Stock transfer updated successfully", data);
}

export async function approveStockTransferController(req: Request, res: Response) {
  const data = await approveStockTransfer(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Stock transfer approved successfully", data);
}

export async function cancelStockTransferController(req: Request, res: Response) {
  const data = await cancelStockTransfer(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Stock transfer cancelled successfully", data);
}
