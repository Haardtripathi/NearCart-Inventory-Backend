import { Router } from "express";

import { authenticateDriver } from "../../middlewares/driverAuth.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  deliverDriverOrderController,
  listDriverOrdersController,
  pickupDriverOrderController,
} from "./driver-orders.controller";

export const driverOrdersRouter = Router();

driverOrdersRouter.use(authenticateDriver);

driverOrdersRouter.get("/orders", asyncHandler(listDriverOrdersController));
driverOrdersRouter.post("/orders/:id/pickup", asyncHandler(pickupDriverOrderController));
driverOrdersRouter.post("/orders/:id/deliver", asyncHandler(deliverDriverOrderController));
