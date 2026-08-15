"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBranchesController = listBranchesController;
exports.createBranchController = createBranchController;
exports.getBranchController = getBranchController;
exports.updateBranchController = updateBranchController;
exports.deleteBranchController = deleteBranchController;
const branchAccess_1 = require("../../utils/branchAccess");
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
const branches_service_1 = require("./branches.service");
// Independent-verification fix (2026-08-10): the branch record itself carries phone, email,
// full postal address, and pickup-point GPS lat/long (see branches.service.ts) — not just a
// display name — and `listBranches`/`getBranchById`/`updateBranch`/`deleteBranch` returned/acted
// on every branch in the org with zero regard for the caller's `branchAccess` allowlist, even
// after the sibling inventory/sales-orders/purchases/stock-transfers modules were fixed for the
// exact same class of bug. A branch-scoped STAFF/MANAGER could `GET /api/branches` and read every
// other branch's exact address, phone, and email, or (if MANAGER-roled) PATCH/DELETE a branch
// they have no access to. Since a branch's own `id` IS the branchId being checked, there's no
// separate record to load first for get/update/delete — the id in the route param is checked
// directly. `id` itself is what the list endpoint restricts to, unlike the other modules whose
// list queries filter on a `branchId` foreign key.
async function listBranchesController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const normalized = req.membership ? (0, branchAccess_1.normalizeBranchAccess)(req.membership.branchAccess) : null;
    const accessibleBranchIds = normalized?.scope === "SELECTED" ? normalized.branchIds : undefined;
    const data = await (0, branches_service_1.listBranches)(req.auth.activeOrganizationId, { ...req.query, accessibleBranchIds }, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Branches fetched successfully", data);
}
async function createBranchController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, branches_service_1.createBranch)(req.auth.activeOrganizationId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Branch created successfully", data);
}
async function getBranchController(req, res) {
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.params.id);
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, branches_service_1.getBranchById)(req.auth.activeOrganizationId, req.params.id, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Branch fetched successfully", data);
}
async function updateBranchController(req, res) {
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.params.id);
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, branches_service_1.updateBranch)(req.auth.activeOrganizationId, req.params.id, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Branch updated successfully", data);
}
async function deleteBranchController(req, res) {
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.params.id);
    const data = await (0, branches_service_1.deleteBranch)(req.auth.activeOrganizationId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Branch deleted successfully", data);
}
