"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listStockTransfersController = listStockTransfersController;
exports.createStockTransferController = createStockTransferController;
exports.getStockTransferController = getStockTransferController;
exports.updateStockTransferController = updateStockTransferController;
exports.approveStockTransferController = approveStockTransferController;
exports.cancelStockTransferController = cancelStockTransferController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const stock_transfers_service_1 = require("./stock-transfers.service");
async function listStockTransfersController(req, res) {
    const data = await (0, stock_transfers_service_1.listStockTransfers)(req.auth.activeOrganizationId, req.query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Stock transfers fetched successfully", data);
}
async function createStockTransferController(req, res) {
    const data = await (0, stock_transfers_service_1.createStockTransfer)(req.auth.activeOrganizationId, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Stock transfer created successfully", data);
}
async function getStockTransferController(req, res) {
    const data = await (0, stock_transfers_service_1.getStockTransferById)(req.auth.activeOrganizationId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Stock transfer fetched successfully", data);
}
async function updateStockTransferController(req, res) {
    const data = await (0, stock_transfers_service_1.updateStockTransfer)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Stock transfer updated successfully", data);
}
async function approveStockTransferController(req, res) {
    const data = await (0, stock_transfers_service_1.approveStockTransfer)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Stock transfer approved successfully", data);
}
async function cancelStockTransferController(req, res) {
    const data = await (0, stock_transfers_service_1.cancelStockTransfer)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Stock transfer cancelled successfully", data);
}
