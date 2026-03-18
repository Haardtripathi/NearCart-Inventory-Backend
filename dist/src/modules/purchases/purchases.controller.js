"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPurchasesController = listPurchasesController;
exports.createPurchaseController = createPurchaseController;
exports.getPurchaseController = getPurchaseController;
exports.updatePurchaseController = updatePurchaseController;
exports.postPurchaseController = postPurchaseController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const purchases_service_1 = require("./purchases.service");
async function listPurchasesController(req, res) {
    const data = await (0, purchases_service_1.listPurchases)(req.auth.activeOrganizationId, req.query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Purchase receipts fetched successfully", data);
}
async function createPurchaseController(req, res) {
    const data = await (0, purchases_service_1.createPurchase)(req.auth.activeOrganizationId, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Purchase receipt created successfully", data);
}
async function getPurchaseController(req, res) {
    const data = await (0, purchases_service_1.getPurchaseById)(req.auth.activeOrganizationId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Purchase receipt fetched successfully", data);
}
async function updatePurchaseController(req, res) {
    const data = await (0, purchases_service_1.updatePurchase)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Purchase receipt updated successfully", data);
}
async function postPurchaseController(req, res) {
    const data = await (0, purchases_service_1.postPurchase)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Purchase receipt posted successfully", data);
}
