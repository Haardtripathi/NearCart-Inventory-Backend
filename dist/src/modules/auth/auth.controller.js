"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapSuperAdminController = bootstrapSuperAdminController;
exports.loginController = loginController;
exports.meController = meController;
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
async function meController(req, res) {
    const data = await (0, auth_service_1.getMe)(req.auth.userId, req.auth.activeOrganizationId, req.auth.role);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Authenticated user fetched successfully", data);
}
