import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import {
  declineDriverOrder,
  deliverDriverOrder,
  listDriverOrders,
  pickupDriverOrder,
  registerDriverDeviceTokenForDriver,
  updateDriverAvailability,
  updateDriverLocation,
} from "./driver-orders.service";

export async function listDriverOrdersController(req: Request, res: Response) {
  const data = await listDriverOrders(req.driverAuth!.driverId);
  return sendSuccess(res, 200, "Assigned orders fetched successfully", data);
}

export async function pickupDriverOrderController(req: Request, res: Response) {
  const data = await pickupDriverOrder(req.driverAuth!.driverId, req.params.id!);
  return sendSuccess(res, 200, "Order picked up successfully", data);
}

export async function declineDriverOrderController(req: Request, res: Response) {
  const data = await declineDriverOrder(req.driverAuth!.driverId, req.params.id!);
  return sendSuccess(res, 200, "Order declined successfully", data);
}

export async function deliverDriverOrderController(req: Request, res: Response) {
  const data = await deliverDriverOrder(req.driverAuth!.driverId, req.params.id!);
  return sendSuccess(res, 200, "Order delivered successfully", data);
}

export async function updateDriverAvailabilityController(req: Request, res: Response) {
  const data = await updateDriverAvailability(req.driverAuth!.driverId, req.body.isAvailableForAssignment);
  return sendSuccess(res, 200, "Availability updated successfully", data);
}

export async function updateDriverLocationController(req: Request, res: Response) {
  const data = await updateDriverLocation(req.driverAuth!.driverId, req.body.latitude, req.body.longitude);
  return sendSuccess(res, 200, "Location updated successfully", data);
}

export async function registerDriverDeviceTokenController(req: Request, res: Response) {
  const data = await registerDriverDeviceTokenForDriver(req.driverAuth!.driverId, req.body);
  return sendSuccess(res, 200, "Device token registered successfully", data);
}
