import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import {
  arriveDriverOrder,
  declineDriverOrder,
  deliverDriverOrder,
  getDriverEarningsSummary,
  getDriverPerformanceSummary,
  listDriverOrderHistory,
  listDriverOrders,
  pickupDriverOrder,
  registerDriverDeviceTokenForDriver,
  updateDriverAvailability,
  updateDriverLocation,
  type DriverEarningsRange,
} from "./driver-orders.service";

const EARNINGS_RANGES: DriverEarningsRange[] = ["today", "week", "month", "all"];

function parseEarningsRange(value: unknown): DriverEarningsRange {
  return typeof value === "string" && (EARNINGS_RANGES as string[]).includes(value)
    ? (value as DriverEarningsRange)
    : "today";
}

export async function listDriverOrdersController(req: Request, res: Response) {
  const data = await listDriverOrders(req.driverAuth!.driverId);
  return sendSuccess(res, 200, "Assigned orders fetched successfully", data);
}

export async function pickupDriverOrderController(req: Request, res: Response) {
  const data = await pickupDriverOrder(req.driverAuth!.driverId, req.params.id!);
  return sendSuccess(res, 200, "Order picked up successfully", data);
}

export async function arriveDriverOrderController(req: Request, res: Response) {
  const data = await arriveDriverOrder(req.driverAuth!.driverId, req.params.id!);
  return sendSuccess(res, 200, "Arrival recorded successfully", data);
}

export async function declineDriverOrderController(req: Request, res: Response) {
  const data = await declineDriverOrder(req.driverAuth!.driverId, req.params.id!);
  return sendSuccess(res, 200, "Order declined successfully", data);
}

export async function deliverDriverOrderController(req: Request, res: Response) {
  const photo = req.file ? { buffer: req.file.buffer, originalname: req.file.originalname } : undefined;
  const data = await deliverDriverOrder(req.driverAuth!.driverId, req.params.id!, photo);
  return sendSuccess(res, 200, "Order delivered successfully", data);
}

export async function listDriverOrderHistoryController(req: Request, res: Response) {
  const page = Number.parseInt(String(req.query.page ?? "1"), 10) || 1;
  const data = await listDriverOrderHistory(req.driverAuth!.driverId, page);
  return sendSuccess(res, 200, "Delivery history fetched successfully", data);
}

export async function getDriverEarningsSummaryController(req: Request, res: Response) {
  const range = parseEarningsRange(req.query.range);
  const data = await getDriverEarningsSummary(req.driverAuth!.driverId, range);
  return sendSuccess(res, 200, "Earnings summary fetched successfully", data);
}

export async function getDriverPerformanceSummaryController(req: Request, res: Response) {
  const range = parseEarningsRange(req.query.range);
  const data = await getDriverPerformanceSummary(req.driverAuth!.driverId, range);
  return sendSuccess(res, 200, "Performance summary fetched successfully", data);
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
