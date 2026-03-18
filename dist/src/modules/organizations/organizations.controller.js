"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrganizationController = createOrganizationController;
exports.getMyOrganizationsController = getMyOrganizationsController;
exports.getOrganizationByIdController = getOrganizationByIdController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const organizations_service_1 = require("./organizations.service");
async function createOrganizationController(req, res) {
    const data = await (0, organizations_service_1.createOrganization)(req.auth.userId, req.auth.role, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Organization created successfully", data);
}
async function getMyOrganizationsController(req, res) {
    const data = await (0, organizations_service_1.getMyOrganizations)(req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Organizations fetched successfully", data);
}
async function getOrganizationByIdController(req, res) {
    const data = await (0, organizations_service_1.getOrganizationById)(req.auth.userId, req.auth.role, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Organization fetched successfully", data);
}
