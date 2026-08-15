"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listStockTransfersController = listStockTransfersController;
exports.createStockTransferController = createStockTransferController;
exports.getStockTransferController = getStockTransferController;
exports.updateStockTransferController = updateStockTransferController;
exports.approveStockTransferController = approveStockTransferController;
exports.cancelStockTransferController = cancelStockTransferController;
const branchAccess_1 = require("../../utils/branchAccess");
const ApiResponse_1 = require("../../utils/ApiResponse");
const stock_transfers_service_1 = require("./stock-transfers.service");
// A transfer touches two branches at once, so both ends are checked — a branch-scoped caller
// must have access to both the source and destination, not just one, to see or act on it.
async function assertCanAccessTransfer(req, organizationId, transferId) {
    const transfer = await (0, stock_transfers_service_1.getStockTransferById)(organizationId, transferId);
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, transfer.fromBranchId);
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, transfer.toBranchId);
    return transfer;
}
async function listStockTransfersController(req, res) {
    const query = req.query;
    if (query.fromBranchId) {
        (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, query.fromBranchId);
    }
    if (query.toBranchId) {
        (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, query.toBranchId);
    }
    const normalized = req.membership ? (0, branchAccess_1.normalizeBranchAccess)(req.membership.branchAccess) : null;
    const accessibleBranchIds = normalized?.scope === "SELECTED" ? normalized.branchIds : undefined;
    const data = await (0, stock_transfers_service_1.listStockTransfers)(req.auth.activeOrganizationId, { ...req.query, accessibleBranchIds });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Stock transfers fetched successfully", data);
}
async function createStockTransferController(req, res) {
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.body.fromBranchId);
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.body.toBranchId);
    const data = await (0, stock_transfers_service_1.createStockTransfer)(req.auth.activeOrganizationId, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Stock transfer created successfully", data);
}
async function getStockTransferController(req, res) {
    const data = await assertCanAccessTransfer(req, req.auth.activeOrganizationId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Stock transfer fetched successfully", data);
}
async function updateStockTransferController(req, res) {
    await assertCanAccessTransfer(req, req.auth.activeOrganizationId, req.params.id);
    if (req.body.fromBranchId) {
        (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.body.fromBranchId);
    }
    if (req.body.toBranchId) {
        (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.body.toBranchId);
    }
    const data = await (0, stock_transfers_service_1.updateStockTransfer)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Stock transfer updated successfully", data);
}
async function approveStockTransferController(req, res) {
    await assertCanAccessTransfer(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, stock_transfers_service_1.approveStockTransfer)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Stock transfer approved successfully", data);
}
async function cancelStockTransferController(req, res) {
    await assertCanAccessTransfer(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, stock_transfers_service_1.cancelStockTransfer)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Stock transfer cancelled successfully", data);
}
