"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.driverVerificationRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const env_1 = require("../../config/env");
const driverAuth_middleware_1 = require("../../middlewares/driverAuth.middleware");
const requireReplicate_middleware_1 = require("../../middlewares/requireReplicate.middleware");
const validate_middleware_1 = require("../../middlewares/validate.middleware");
const asyncHandler_1 = require("../../utils/asyncHandler");
const ApiError_1 = require("../../utils/ApiError");
const driver_verification_controller_1 = require("./driver-verification.controller");
const driver_verification_validation_1 = require("./driver-verification.validation");
const photoUpload = (0, multer_1.default)({
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
function handlePhotoUpload(req, res, next) {
    photoUpload.single("photo")(req, res, (error) => {
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
}
// Mounted at the same "/driver" prefix as driver-orders.route.ts (see routes/index.ts) — full
// paths end up as POST /api/driver/verification/vehicle-photo, /license, /license/confirm. This
// is a locked contract shared with the separate NearCart-Driver / NearCart-Driver-Web client
// repos; do not rename these paths without coordinating there.
exports.driverVerificationRouter = (0, express_1.Router)();
exports.driverVerificationRouter.use(driverAuth_middleware_1.authenticateDriver);
// Pure read of what's currently on file — not gated by requireReplicateConfigured (no Replicate
// call involved) unlike the three verify/OCR routes below. Backs the driver app's Documents screen.
exports.driverVerificationRouter.get("/verification/status", (0, asyncHandler_1.asyncHandler)(driver_verification_controller_1.getDriverVerificationStatusController));
exports.driverVerificationRouter.post("/verification/vehicle-photo", requireReplicate_middleware_1.requireReplicateConfigured, handlePhotoUpload, (0, asyncHandler_1.asyncHandler)(driver_verification_controller_1.verifyDriverVehiclePhotoController));
exports.driverVerificationRouter.post("/verification/license", requireReplicate_middleware_1.requireReplicateConfigured, handlePhotoUpload, (0, asyncHandler_1.asyncHandler)(driver_verification_controller_1.ocrDriverLicenseController));
exports.driverVerificationRouter.post("/verification/license/confirm", requireReplicate_middleware_1.requireReplicateConfigured, (0, validate_middleware_1.validateRequest)({ body: driver_verification_validation_1.confirmLicenseSchema }), (0, asyncHandler_1.asyncHandler)(driver_verification_controller_1.confirmDriverLicenseController));
