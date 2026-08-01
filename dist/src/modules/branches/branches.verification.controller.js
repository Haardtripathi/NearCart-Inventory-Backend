"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyShopPhotoController = verifyShopPhotoController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const ApiError_1 = require("../../utils/ApiError");
const branches_verification_service_1 = require("./branches.verification.service");
async function verifyShopPhotoController(req, res) {
    if (!req.file) {
        throw ApiError_1.ApiError.badRequest("Photo file is required");
    }
    const data = await (0, branches_verification_service_1.verifyShopPhoto)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, { buffer: req.file.buffer, originalname: req.file.originalname });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Shop photo verification completed", data);
}
