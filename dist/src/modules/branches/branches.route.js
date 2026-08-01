"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.branchesRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const env_1 = require("../../config/env");
const roles_1 = require("../../constants/roles");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const org_middleware_1 = require("../../middlewares/org.middleware");
const validate_middleware_1 = require("../../middlewares/validate.middleware");
const asyncHandler_1 = require("../../utils/asyncHandler");
const ApiError_1 = require("../../utils/ApiError");
const branches_controller_1 = require("./branches.controller");
const branches_verification_controller_1 = require("./branches.verification.controller");
const branches_validation_1 = require("./branches.validation");
exports.branchesRouter = (0, express_1.Router)();
exports.branchesRouter.use(auth_middleware_1.authenticate, org_middleware_1.requireOrganizationContext);
exports.branchesRouter.get("/", (0, auth_middleware_1.requireRoles)(...roles_1.READ_WRITE_STAFF_ROLES), (0, validate_middleware_1.validateRequest)({ query: branches_validation_1.branchQuerySchema }), (0, asyncHandler_1.asyncHandler)(branches_controller_1.listBranchesController));
exports.branchesRouter.post("/", (0, auth_middleware_1.requireRoles)(...roles_1.MANAGER_ROLES), (0, validate_middleware_1.validateRequest)({ body: branches_validation_1.createBranchSchema }), (0, asyncHandler_1.asyncHandler)(branches_controller_1.createBranchController));
exports.branchesRouter.get("/:id", (0, auth_middleware_1.requireRoles)(...roles_1.READ_WRITE_STAFF_ROLES), (0, asyncHandler_1.asyncHandler)(branches_controller_1.getBranchController));
exports.branchesRouter.patch("/:id", (0, auth_middleware_1.requireRoles)(...roles_1.MANAGER_ROLES), (0, validate_middleware_1.validateRequest)({ body: branches_validation_1.updateBranchSchema }), (0, asyncHandler_1.asyncHandler)(branches_controller_1.updateBranchController));
exports.branchesRouter.delete("/:id", (0, auth_middleware_1.requireRoles)(...roles_1.MANAGER_ROLES), (0, asyncHandler_1.asyncHandler)(branches_controller_1.deleteBranchController));
// Compulsory shop-photo verification (see branches.verification.service.ts) — deliberately NOT
// gated by requireReplicateConfigured like the driver-verification endpoints below: the photo
// upload itself must always succeed for onboarding to proceed, even when Replicate isn't
// configured yet (only the AI clarity/name check inside the service degrades gracefully).
const shopPhotoUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: env_1.env.IMAGE_UPLOAD_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith("image/")) {
            callback(ApiError_1.ApiError.badRequest("Only image uploads are supported"));
            return;
        }
        callback(null, true);
    },
});
exports.branchesRouter.post("/:id/verification/photo", (0, auth_middleware_1.requireRoles)(...roles_1.MANAGER_ROLES), (req, res, next) => {
    shopPhotoUpload.single("photo")(req, res, (error) => {
        if (error instanceof multer_1.default.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                next(ApiError_1.ApiError.badRequest(`Photo must be smaller than ${Math.floor(env_1.env.IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB`));
                return;
            }
            next(ApiError_1.ApiError.badRequest(error.message));
            return;
        }
        next(error);
    });
}, (0, asyncHandler_1.asyncHandler)(branches_verification_controller_1.verifyShopPhotoController));
