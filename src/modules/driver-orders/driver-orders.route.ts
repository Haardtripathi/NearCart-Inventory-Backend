import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";

import { env } from "../../config/env";
import { authenticateDriver } from "../../middlewares/driverAuth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { deviceTokenSchema } from "../../utils/validation";
import {
  declineDriverOrderController,
  deliverDriverOrderController,
  getDriverEarningsSummaryController,
  getDriverPerformanceSummaryController,
  listDriverOrderHistoryController,
  listDriverOrdersController,
  pickupDriverOrderController,
  registerDriverDeviceTokenController,
  updateDriverAvailabilityController,
  updateDriverLocationController,
} from "./driver-orders.controller";
import { updateDriverAvailabilitySchema, updateDriverLocationSchema } from "./driver-orders.validation";

export const driverOrdersRouter = Router();

driverOrdersRouter.use(authenticateDriver);

// Same memoryStorage + image-only multer pattern as driver-verification.route.ts's photoUpload —
// delivery-proof photos go through the same size limit and get streamed straight to Cloudinary,
// never touching disk. `.single("photo")` is wired via a small wrapper (not the plain
// `photoUpload.single("photo")` middleware directly) so a bad/oversized upload here degrades to a
// clean 400 instead of an unhandled multer error, same as that other route.
const deliveryProofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.IMAGE_UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(ApiError.badRequest("Only image uploads are supported"));
      return;
    }
    callback(null, true);
  },
});

function handleOptionalDeliveryProofUpload(req: Request, res: Response, next: NextFunction) {
  deliveryProofUpload.single("photo")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        next(ApiError.badRequest(`Photo must be smaller than ${Math.floor(env.IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB`));
        return;
      }
      next(ApiError.badRequest(error.message));
      return;
    }
    next(error);
  });
}

driverOrdersRouter.get("/orders", asyncHandler(listDriverOrdersController));
driverOrdersRouter.get("/orders/history", asyncHandler(listDriverOrderHistoryController));
driverOrdersRouter.post("/orders/:id/pickup", asyncHandler(pickupDriverOrderController));
driverOrdersRouter.post("/orders/:id/decline", asyncHandler(declineDriverOrderController));
driverOrdersRouter.post(
  "/orders/:id/deliver",
  handleOptionalDeliveryProofUpload,
  asyncHandler(deliverDriverOrderController),
);

driverOrdersRouter.get("/earnings/summary", asyncHandler(getDriverEarningsSummaryController));
driverOrdersRouter.get("/performance/summary", asyncHandler(getDriverPerformanceSummaryController));

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
