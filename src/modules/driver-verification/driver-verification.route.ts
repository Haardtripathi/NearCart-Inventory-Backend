import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";

import { env } from "../../config/env";
import { authenticateDriver } from "../../middlewares/driverAuth.middleware";
import { requireReplicateConfigured } from "../../middlewares/requireReplicate.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import {
  confirmDriverLicenseController,
  ocrDriverLicenseController,
  verifyDriverVehiclePhotoController,
} from "./driver-verification.controller";
import { confirmLicenseSchema } from "./driver-verification.validation";

const photoUpload = multer({
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

function handlePhotoUpload(req: Request, res: Response, next: NextFunction) {
  photoUpload.single("photo")(req, res, (error: unknown) => {
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

// Mounted at the same "/driver" prefix as driver-orders.route.ts (see routes/index.ts) — full
// paths end up as POST /api/driver/verification/vehicle-photo, /license, /license/confirm. This
// is a locked contract shared with the separate NearCart-Driver / NearCart-Driver-Web client
// repos; do not rename these paths without coordinating there.
export const driverVerificationRouter = Router();

driverVerificationRouter.use(authenticateDriver);

driverVerificationRouter.post(
  "/verification/vehicle-photo",
  requireReplicateConfigured,
  handlePhotoUpload,
  asyncHandler(verifyDriverVehiclePhotoController),
);

driverVerificationRouter.post(
  "/verification/license",
  requireReplicateConfigured,
  handlePhotoUpload,
  asyncHandler(ocrDriverLicenseController),
);

driverVerificationRouter.post(
  "/verification/license/confirm",
  requireReplicateConfigured,
  validateRequest({ body: confirmLicenseSchema }),
  asyncHandler(confirmDriverLicenseController),
);
