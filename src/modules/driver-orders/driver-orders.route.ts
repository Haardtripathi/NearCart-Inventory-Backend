import { Router } from "express";

import { authenticateDriver } from "../../middlewares/driverAuth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { deviceTokenSchema } from "../../utils/validation";
import {
  deliverDriverOrderController,
  listDriverOrdersController,
  pickupDriverOrderController,
  registerDriverDeviceTokenController,
  updateDriverAvailabilityController,
  updateDriverLocationController,
} from "./driver-orders.controller";
import { updateDriverAvailabilitySchema, updateDriverLocationSchema } from "./driver-orders.validation";

export const driverOrdersRouter = Router();

driverOrdersRouter.use(authenticateDriver);

driverOrdersRouter.get("/orders", asyncHandler(listDriverOrdersController));
driverOrdersRouter.post("/orders/:id/pickup", asyncHandler(pickupDriverOrderController));
driverOrdersRouter.post("/orders/:id/deliver", asyncHandler(deliverDriverOrderController));

driverOrdersRouter.patch(
  "/availability",
  validateRequest({ body: updateDriverAvailabilitySchema }),
  asyncHandler(updateDriverAvailabilityController),
);
driverOrdersRouter.patch(
  "/location",
  validateRequest({ body: updateDriverLocationSchema }),
  asyncHandler(updateDriverLocationController),
);
driverOrdersRouter.post(
  "/device-token",
  validateRequest({ body: deviceTokenSchema }),
  asyncHandler(registerDriverDeviceTokenController),
);
