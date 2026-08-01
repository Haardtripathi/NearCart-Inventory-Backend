import { Router } from "express";
import multer from "multer";

import { env } from "../../config/env";
import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import {
  createBranchController,
  deleteBranchController,
  getBranchController,
  listBranchesController,
  updateBranchController,
} from "./branches.controller";
import { verifyShopPhotoController } from "./branches.verification.controller";
import { branchQuerySchema, createBranchSchema, updateBranchSchema } from "./branches.validation";

export const branchesRouter = Router();

branchesRouter.use(authenticate, requireOrganizationContext);

branchesRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: branchQuerySchema }), asyncHandler(listBranchesController));
branchesRouter.post("/", requireRoles(...MANAGER_ROLES), validateRequest({ body: createBranchSchema }), asyncHandler(createBranchController));
branchesRouter.get("/:id", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(getBranchController));
branchesRouter.patch("/:id", requireRoles(...MANAGER_ROLES), validateRequest({ body: updateBranchSchema }), asyncHandler(updateBranchController));
branchesRouter.delete("/:id", requireRoles(...MANAGER_ROLES), asyncHandler(deleteBranchController));

// Compulsory shop-photo verification (see branches.verification.service.ts) — deliberately NOT
// gated by requireReplicateConfigured like the driver-verification endpoints below: the photo
// upload itself must always succeed for onboarding to proceed, even when Replicate isn't
// configured yet (only the AI clarity/name check inside the service degrades gracefully).
const shopPhotoUpload = multer({
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

branchesRouter.post(
  "/:id/verification/photo",
  requireRoles(...MANAGER_ROLES),
  (req, res, next) => {
    shopPhotoUpload.single("photo")(req, res, (error) => {
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
  },
  asyncHandler(verifyShopPhotoController),
);
