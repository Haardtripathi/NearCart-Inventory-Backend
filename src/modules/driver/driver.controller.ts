import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { deliverDriverOrder, listDriverOrders, pickupDriverOrder } from "./driver.service";

export async function listDriverOrdersController(req: Request, res: Response) {
  const data = await listDriverOrders(req.auth!.activeOrganizationId!, req.auth!.userId);
  return sendSuccess(res, 200, "Driver orders fetched successfully", data);
}

export async function pickupDriverOrderController(req: Request, res: Response) {
  const data = await pickupDriverOrder(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Order picked up successfully", data);
}

export async function deliverDriverOrderController(req: Request, res: Response) {
  const data = await deliverDriverOrder(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Order delivered successfully", data);
}
