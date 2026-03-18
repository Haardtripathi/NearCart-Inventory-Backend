"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIndustriesController = getIndustriesController;
exports.createIndustryController = createIndustryController;
exports.updateIndustryController = updateIndustryController;
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
