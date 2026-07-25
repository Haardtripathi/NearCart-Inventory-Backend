import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { deliverDriverOrder, listDriverOrders, pickupDriverOrder } from "./driver-orders.service";

export async function listDriverOrdersController(req: Request, res: Response) {
  const data = await listDriverOrders(req.driverAuth!.driverId);
  return sendSuccess(res, 200, "Assigned orders fetched successfully", data);
}

export async function pickupDriverOrderController(req: Request, res: Response) {
  const data = await pickupDriverOrder(req.driverAuth!.driverId, req.params.id!);
  return sendSuccess(res, 200, "Order picked up successfully", data);
}

export async function deliverDriverOrderController(req: Request, res: Response) {
  const data = await deliverDriverOrder(req.driverAuth!.driverId, req.params.id!);
  return sendSuccess(res, 200, "Order delivered successfully", data);
}
