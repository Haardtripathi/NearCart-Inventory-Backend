"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapSuperAdminController = bootstrapSuperAdminController;
exports.loginController = loginController;
exports.registerOrganizationOwnerController = registerOrganizationOwnerController;
exports.completeAccountSetupController = completeAccountSetupController;
exports.resetPasswordController = resetPasswordController;
exports.changePasswordController = changePasswordController;
exports.updateMyPreferencesController = updateMyPreferencesController;
exports.meController = meController;
const client_1 = require("@prisma/client");
const ApiResponse_1 = require("../../utils/ApiResponse");
const request_1 = require("../../utils/request");
const auth_service_1 = require("./auth.service");
async function bootstrapSuperAdminController(req, res) {
    const user = await (0, auth_service_1.bootstrapSuperAdmin)(req.body, (0, request_1.getRequestMeta)(req));
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Super admin bootstrapped successfully", user);
}
async function loginController(req, res) {
    const data = await (0, auth_service_1.login)(req.body, (0, request_1.getRequestMeta)(req));
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Login successful", data);
}
async function registerOrganizationOwnerController(req, res) {
    const data = await (0, auth_service_1.registerOrganizationOwner)(req.body, (0, request_1.getRequestMeta)(req));
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Organization owner registered successfully", data);
}
async function completeAccountSetupController(req, res) {
    const data = await (0, auth_service_1.completeAccountSetup)(req.body, (0, request_1.getRequestMeta)(req));
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Account setup completed successfully", data);
}
async function resetPasswordController(req, res) {
    const data = await (0, auth_service_1.resetPasswordWithToken)(req.body, (0, request_1.getRequestMeta)(req));
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Password reset successfully", data);
}
async function changePasswordController(req, res) {
    const data = await (0, auth_service_1.changePassword)(req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Password changed successfully", data);
}
async function updateMyPreferencesController(req, res) {
    const data = await (0, auth_service_1.updateMyPreferences)(req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Preferences updated successfully", data);
}
async function meController(req, res) {
    const requestedOrganizationId = req.auth.role === client_1.UserRole.SUPER_ADMIN && typeof req.headers["x-organization-id"] === "string"
        ? req.headers["x-organization-id"]
        : req.auth.activeOrganizationId;
    const data = await (0, auth_service_1.getMe)(req.auth.userId, requestedOrganizationId, req.auth.role);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Authenticated user fetched successfully", data);
}
