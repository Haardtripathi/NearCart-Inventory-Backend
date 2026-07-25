"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIndustriesController = getIndustriesController;
exports.createIndustryController = createIndustryController;
exports.updateIndustryController = updateIndustryController;
exports.getPlatformDriversController = getPlatformDriversController;
exports.verifyPlatformDriverController = verifyPlatformDriverController;
exports.suspendPlatformDriverController = suspendPlatformDriverController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
const platform_service_1 = require("./platform.service");
async function getIndustriesController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, platform_service_1.listIndustries)(localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Industries fetched successfully", data);
}
async function createIndustryController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, platform_service_1.createIndustry)(req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Industry created successfully", data);
}
async function updateIndustryController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, platform_service_1.updateIndustry)(req.params.id, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Industry updated successfully", data);
}
async function getPlatformDriversController(req, res) {
    const data = await (0, platform_service_1.listPlatformDrivers)(req.query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Drivers fetched successfully", data);
}
async function verifyPlatformDriverController(req, res) {
    const data = await (0, platform_service_1.verifyPlatformDriver)(req.auth.userId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Driver verified successfully", data);
}
async function suspendPlatformDriverController(req, res) {
    const data = await (0, platform_service_1.suspendPlatformDriver)(req.auth.userId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Driver suspended successfully", data);
}
