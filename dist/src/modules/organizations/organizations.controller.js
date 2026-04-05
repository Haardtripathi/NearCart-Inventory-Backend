"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrganizationController = createOrganizationController;
exports.getMyOrganizationsController = getMyOrganizationsController;
exports.getOrganizationByIdController = getOrganizationByIdController;
exports.addIndustryToOrganizationController = addIndustryToOrganizationController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
const organizations_service_1 = require("./organizations.service");
async function createOrganizationController(req, res) {
    const data = await (0, organizations_service_1.createOrganization)(req.auth.userId, req.auth.role, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Organization created successfully", data);
}
async function getMyOrganizationsController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, organizations_service_1.getMyOrganizations)(req.auth.userId, req.auth.role, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Organizations fetched successfully", data);
}
async function getOrganizationByIdController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, organizations_service_1.getOrganizationById)(req.auth.userId, req.auth.role, req.params.id, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Organization fetched successfully", data);
}
async function addIndustryToOrganizationController(req, res) {
    const data = await (0, organizations_service_1.addIndustryToOrganization)(req.auth.userId, req.auth.role, req.params.id, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Industry enabled for organization successfully", data);
}
