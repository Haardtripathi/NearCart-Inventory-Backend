"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchUsersDirectoryController = searchUsersDirectoryController;
exports.listOrganizationUsersController = listOrganizationUsersController;
exports.createOrganizationUserController = createOrganizationUserController;
exports.updateOrganizationUserController = updateOrganizationUserController;
exports.generateOrganizationUserAccessLinkController = generateOrganizationUserAccessLinkController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const users_service_1 = require("./users.service");
async function searchUsersDirectoryController(req, res) {
    const data = await (0, users_service_1.searchUsersDirectory)(typeof req.query.search === "string" ? req.query.search : undefined);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Users fetched successfully", data);
}
async function listOrganizationUsersController(req, res) {
    const data = await (0, users_service_1.listOrganizationUsers)(req.auth.activeOrganizationId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Organization users fetched successfully", data);
}
async function createOrganizationUserController(req, res) {
    const data = await (0, users_service_1.createOrganizationUser)(req.auth.userId, req.auth.role, req.auth.activeOrganizationId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Organization user created successfully", data);
}
async function updateOrganizationUserController(req, res) {
    const data = await (0, users_service_1.updateOrganizationUser)(req.auth.userId, req.auth.role, req.auth.activeOrganizationId, req.params.id, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Organization user updated successfully", data);
}
async function generateOrganizationUserAccessLinkController(req, res) {
    const data = await (0, users_service_1.generateOrganizationUserAccessLink)(req.auth.userId, req.auth.activeOrganizationId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "User access link generated successfully", data);
}
