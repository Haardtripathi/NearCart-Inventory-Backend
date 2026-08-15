"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyDriverVehiclePhotoController = verifyDriverVehiclePhotoController;
exports.ocrDriverLicenseController = ocrDriverLicenseController;
exports.confirmDriverLicenseController = confirmDriverLicenseController;
exports.getDriverVerificationStatusController = getDriverVerificationStatusController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const ApiError_1 = require("../../utils/ApiError");
const driver_verification_service_1 = require("./driver-verification.service");
async function verifyDriverVehiclePhotoController(req, res) {
    if (!req.file) {
        throw ApiError_1.ApiError.badRequest("Photo file is required");
    }
    const data = await (0, driver_verification_service_1.verifyDriverVehiclePhoto)(req.driverAuth.driverId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
    });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Vehicle photo verification completed", data);
}
async function ocrDriverLicenseController(req, res) {
    if (!req.file) {
        throw ApiError_1.ApiError.badRequest("Photo file is required");
    }
    const data = await (0, driver_verification_service_1.ocrDriverLicense)(req.driverAuth.driverId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
    });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "License OCR completed", data);
}
async function confirmDriverLicenseController(req, res) {
    const data = await (0, driver_verification_service_1.confirmDriverLicense)(req.driverAuth.driverId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "License verification completed", data);
}
async function getDriverVerificationStatusController(req, res) {
    const data = await (0, driver_verification_service_1.getDriverVerificationStatus)(req.driverAuth.driverId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Verification status fetched successfully", data);
}
