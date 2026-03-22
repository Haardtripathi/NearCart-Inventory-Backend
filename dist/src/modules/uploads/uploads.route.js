"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadsRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const roles_1 = require("../../constants/roles");
const env_1 = require("../../config/env");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const asyncHandler_1 = require("../../utils/asyncHandler");
const ApiError_1 = require("../../utils/ApiError");
const uploads_controller_1 = require("./uploads.controller");
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: env_1.env.IMAGE_UPLOAD_MAX_BYTES,
        files: 1,
    },
    fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith("image/")) {
            callback(ApiError_1.ApiError.badRequest("Only image uploads are supported"));
            return;
        }
        callback(null, true);
    },
});
exports.uploadsRouter = (0, express_1.Router)();
exports.uploadsRouter.use(auth_middleware_1.authenticate);
exports.uploadsRouter.post("/images", (0, auth_middleware_1.requireRoles)(...roles_1.MANAGER_ROLES), (req, res, next) => {
    upload.single("file")(req, res, (error) => {
        if (error instanceof multer_1.default.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                next(ApiError_1.ApiError.badRequest(`Image must be smaller than ${Math.floor(env_1.env.IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB`));
                return;
            }
            next(ApiError_1.ApiError.badRequest(error.message));
            return;
        }
        next(error);
    });
}, (0, asyncHandler_1.asyncHandler)(uploads_controller_1.uploadImageController));
