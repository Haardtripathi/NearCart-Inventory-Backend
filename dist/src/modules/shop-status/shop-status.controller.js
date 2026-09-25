"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShopStatusController = getShopStatusController;
exports.updateShopStatusController = updateShopStatusController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const shop_status_service_1 = require("./shop-status.service");
async function getShopStatusController(req, res) {
    const data = await (0, shop_status_service_1.getShopStatus)(req.auth.activeOrganizationId, req.membership?.branchAccess, req.query.branchId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Shop status fetched successfully", data);
}
async function updateShopStatusController(req, res) {
    const data = await (0, shop_status_service_1.updateShopStatus)(req.auth.activeOrganizationId, req.auth.userId, req.membership?.branchAccess, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, req.body.isOpen ? "Shop marked open for today" : "Shop marked closed for today", data);
}
