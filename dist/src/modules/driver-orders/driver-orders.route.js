"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.driverOrdersRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const env_1 = require("../../config/env");
const driverAuth_middleware_1 = require("../../middlewares/driverAuth.middleware");
const validate_middleware_1 = require("../../middlewares/validate.middleware");
const asyncHandler_1 = require("../../utils/asyncHandler");
const ApiError_1 = require("../../utils/ApiError");
const validation_1 = require("../../utils/validation");
const driver_orders_controller_1 = require("./driver-orders.controller");
const driver_orders_validation_1 = require("./driver-orders.validation");
exports.driverOrdersRouter = (0, express_1.Router)();
exports.driverOrdersRouter.use(driverAuth_middleware_1.authenticateDriver);
// Same memoryStorage + image-only multer pattern as driver-verification.route.ts's photoUpload —
// delivery-proof photos go through the same size limit and get streamed straight to Cloudinary,
// never touching disk. `.single("photo")` is wired via a small wrapper (not the plain
// `photoUpload.single("photo")` middleware directly) so a bad/oversized upload here degrades to a
// clean 400 instead of an unhandled multer error, same as that other route.
const deliveryProofUpload = (0, multer_1.default)({
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
function handleOptionalDeliveryProofUpload(req, res, next) {
    deliveryProofUpload.single("photo")(req, res, (error) => {
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
exports.driverOrdersRouter.get("/orders", (0, asyncHandler_1.asyncHandler)(driver_orders_controller_1.listDriverOrdersController));
exports.driverOrdersRouter.get("/orders/history", (0, asyncHandler_1.asyncHandler)(driver_orders_controller_1.listDriverOrderHistoryController));
exports.driverOrdersRouter.post("/orders/:id/arrived", (0, asyncHandler_1.asyncHandler)(driver_orders_controller_1.arriveDriverOrderController));
exports.driverOrdersRouter.post("/orders/:id/pickup", (0, asyncHandler_1.asyncHandler)(driver_orders_controller_1.pickupDriverOrderController));
exports.driverOrdersRouter.post("/orders/:id/decline", (0, asyncHandler_1.asyncHandler)(driver_orders_controller_1.declineDriverOrderController));
exports.driverOrdersRouter.post("/orders/:id/deliver", handleOptionalDeliveryProofUpload, (0, asyncHandler_1.asyncHandler)(driver_orders_controller_1.deliverDriverOrderController));
exports.driverOrdersRouter.get("/earnings/summary", (0, asyncHandler_1.asyncHandler)(driver_orders_controller_1.getDriverEarningsSummaryController));
exports.driverOrdersRouter.get("/performance/summary", (0, asyncHandler_1.asyncHandler)(driver_orders_controller_1.getDriverPerformanceSummaryController));
exports.driverOrdersRouter.patch("/availability", (0, validate_middleware_1.validateRequest)({ body: driver_orders_validation_1.updateDriverAvailabilitySchema }), (0, asyncHandler_1.asyncHandler)(driver_orders_controller_1.updateDriverAvailabilityController));
exports.driverOrdersRouter.patch("/location", (0, validate_middleware_1.validateRequest)({ body: driver_orders_validation_1.updateDriverLocationSchema }), (0, asyncHandler_1.asyncHandler)(driver_orders_controller_1.updateDriverLocationController));
exports.driverOrdersRouter.post("/device-token", (0, validate_middleware_1.validateRequest)({ body: validation_1.deviceTokenSchema }), (0, asyncHandler_1.asyncHandler)(driver_orders_controller_1.registerDriverDeviceTokenController));
