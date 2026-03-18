"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBalancesController = getBalancesController;
exports.getLedgerController = getLedgerController;
exports.createAdjustmentController = createAdjustmentController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const inventory_service_1 = require("./inventory.service");
async function getBalancesController(req, res) {
    const data = await (0, inventory_service_1.listBalances)(req.auth.activeOrganizationId, req.query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Inventory balances fetched successfully", data);
}
async function getLedgerController(req, res) {
    const data = await (0, inventory_service_1.listLedger)(req.auth.activeOrganizationId, req.query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Inventory ledger fetched successfully", data);
}
async function createAdjustmentController(req, res) {
    const data = await (0, inventory_service_1.createAdjustment)(req.auth.activeOrganizationId, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Inventory adjustment posted successfully", data);
}
