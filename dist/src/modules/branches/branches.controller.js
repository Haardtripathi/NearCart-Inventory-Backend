"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBranchesController = listBranchesController;
exports.createBranchController = createBranchController;
exports.getBranchController = getBranchController;
exports.updateBranchController = updateBranchController;
exports.deleteBranchController = deleteBranchController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
const branches_service_1 = require("./branches.service");
async function listBranchesController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, branches_service_1.listBranches)(req.auth.activeOrganizationId, req.query, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Branches fetched successfully", data);
}
async function createBranchController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, branches_service_1.createBranch)(req.auth.activeOrganizationId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Branch created successfully", data);
}
async function getBranchController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, branches_service_1.getBranchById)(req.auth.activeOrganizationId, req.params.id, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Branch fetched successfully", data);
}
async function updateBranchController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, branches_service_1.updateBranch)(req.auth.activeOrganizationId, req.params.id, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Branch updated successfully", data);
}
async function deleteBranchController(req, res) {
    const data = await (0, branches_service_1.deleteBranch)(req.auth.activeOrganizationId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Branch deleted successfully", data);
}
