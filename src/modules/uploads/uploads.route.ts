import { Router } from "express";
import multer from "multer";

import { MANAGER_ROLES } from "../../constants/roles";
import { env } from "../../config/env";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { uploadImageController } from "./uploads.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.IMAGE_UPLOAD_MAX_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(ApiError.badRequest("Only image uploads are supported"));
      return;
    }

    callback(null, true);
  },
});

export const uploadsRouter = Router();

uploadsRouter.use(authenticate);

uploadsRouter.post(
  "/images",
  requireRoles(...MANAGER_ROLES),
  (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          next(ApiError.badRequest(`Image must be smaller than ${Math.floor(env.IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB`));
          return;
        }

        next(ApiError.badRequest(error.message));
        return;
      }

      next(error);
    });
  },
  asyncHandler(uploadImageController),
);
