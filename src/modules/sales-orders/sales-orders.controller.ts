import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import {
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  deliverSalesOrder,
  getSalesOrderById,
  listSalesOrders,
  rejectSalesOrder,
  updateSalesOrder,
} from "./sales-orders.service";

export async function listSalesOrdersController(req: Request, res: Response) {
  const data = await listSalesOrders(req.auth!.activeOrganizationId!, req.query as never);
  return sendSuccess(res, 200, "Sales orders fetched successfully", data);
}

export async function createSalesOrderController(req: Request, res: Response) {
  const data = await createSalesOrder(req.auth!.activeOrganizationId!, req.auth!.userId, req.body);
  return sendSuccess(res, 201, "Sales order created successfully", data);
}

export async function getSalesOrderController(req: Request, res: Response) {
  const data = await getSalesOrderById(req.auth!.activeOrganizationId!, req.params.id!);
  return sendSuccess(res, 200, "Sales order fetched successfully", data);
}

export async function updateSalesOrderController(req: Request, res: Response) {
  const data = await updateSalesOrder(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId, req.body);
  return sendSuccess(res, 200, "Sales order updated successfully", data);
}

export async function confirmSalesOrderController(req: Request, res: Response) {
  const data = await confirmSalesOrder(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Sales order confirmed successfully", data);
}

export async function rejectSalesOrderController(req: Request, res: Response) {
  const data = await rejectSalesOrder(
    req.auth!.activeOrganizationId!,
    req.params.id!,
    req.auth!.userId,
    req.body.rejectionReason,
  );
  return sendSuccess(res, 200, "Sales order rejected successfully", data);
}

export async function cancelSalesOrderController(req: Request, res: Response) {
  const data = await cancelSalesOrder(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Sales order cancelled successfully", data);
}

export async function deliverSalesOrderController(req: Request, res: Response) {
  const data = await deliverSalesOrder(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Sales order delivered successfully", data);
}
