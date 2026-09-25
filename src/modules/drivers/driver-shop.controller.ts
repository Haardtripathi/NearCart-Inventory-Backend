import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { getDriverShop, joinDriverShop, leaveDriverShop } from "./driver-shop.service";

export async function getDriverShopController(req: Request, res: Response) {
  const data = await getDriverShop(req.driverAuth!.driverId);
  return sendSuccess(res, 200, "Shop fetched successfully", data);
}

export async function joinDriverShopController(req: Request, res: Response) {
  const data = await joinDriverShop(req.driverAuth!.driverId, req.body.storeCode);
  return sendSuccess(res, 200, "You joined the shop", data);
}

export async function leaveDriverShopController(req: Request, res: Response) {
  const data = await leaveDriverShop(req.driverAuth!.driverId);
  return sendSuccess(res, 200, "You left the shop", data);
}
