"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImageController = uploadImageController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const ApiError_1 = require("../../utils/ApiError");
const uploads_service_1 = require("./uploads.service");
function parseScope(value) {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "general";
    switch (normalized) {
        case "product":
        case "category":
        case "brand":
        case "supplier":
        case "customer":
        case "branch":
        case "master-catalog-item":
        case "master-catalog-category":
            return normalized;
        default:
            return "general";
    }
}
async function uploadImageController(req, res) {
    if (!req.file) {
        throw ApiError_1.ApiError.badRequest("Image file is required");
    }
    const scope = parseScope(req.body.scope);
    const ownerId = req.auth?.activeOrganizationId ?? "platform";
    const data = await (0, uploads_service_1.uploadImageToCloudinary)({
        fileBuffer: req.file.buffer,
        originalFilename: req.file.originalname,
        scope,
        ownerId,
    });
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Image uploaded successfully", data);
}
