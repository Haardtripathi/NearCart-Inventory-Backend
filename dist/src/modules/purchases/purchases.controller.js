"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPurchasesController = listPurchasesController;
exports.createPurchaseController = createPurchaseController;
exports.getPurchaseController = getPurchaseController;
exports.updatePurchaseController = updatePurchaseController;
exports.postPurchaseController = postPurchaseController;
const branchAccess_1 = require("../../utils/branchAccess");
const ApiResponse_1 = require("../../utils/ApiResponse");
const purchases_service_1 = require("./purchases.service");
// See the equivalent helper in sales-orders.controller.ts — same reasoning: the purchase's
// branchId isn't known until it's loaded, so every single-purchase action loads it first and
// checks branch access against its actual branchId.
async function assertCanAccessPurchase(req, organizationId, purchaseId) {
    const purchase = await (0, purchases_service_1.getPurchaseById)(organizationId, purchaseId);
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, purchase.branchId);
    return purchase;
}
async function listPurchasesController(req, res) {
    const branchId = (0, branchAccess_1.resolveBranchFilter)(req.membership?.branchAccess, req.query.branchId);
    const data = await (0, purchases_service_1.listPurchases)(req.auth.activeOrganizationId, { ...req.query, branchId });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Purchase receipts fetched successfully", data);
}
async function createPurchaseController(req, res) {
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.body.branchId);
    const data = await (0, purchases_service_1.createPurchase)(req.auth.activeOrganizationId, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Purchase receipt created successfully", data);
}
async function getPurchaseController(req, res) {
    const data = await assertCanAccessPurchase(req, req.auth.activeOrganizationId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Purchase receipt fetched successfully", data);
}
async function updatePurchaseController(req, res) {
    await assertCanAccessPurchase(req, req.auth.activeOrganizationId, req.params.id);
    if (req.body.branchId) {
        (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.body.branchId);
    }
    const data = await (0, purchases_service_1.updatePurchase)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Purchase receipt updated successfully", data);
}
async function postPurchaseController(req, res) {
    await assertCanAccessPurchase(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, purchases_service_1.postPurchase)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Purchase receipt posted successfully", data);
}
