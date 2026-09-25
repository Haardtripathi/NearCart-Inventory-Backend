"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAssignableDriversController = listAssignableDriversController;
exports.createDriverShopCodeController = createDriverShopCodeController;
exports.listShopDriversController = listShopDriversController;
exports.removeShopDriverController = removeShopDriverController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const branchAccess_1 = require("../../utils/branchAccess");
const driver_shop_service_1 = require("./driver-shop.service");
const drivers_service_1 = require("./drivers.service");
async function listAssignableDriversController(req, res) {
    const data = await (0, drivers_service_1.listAssignableDrivers)(req.query, req.auth.activeOrganizationId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Drivers fetched successfully", data);
}
async function createDriverShopCodeController(req, res) {
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.body.branchId);
    const data = await (0, driver_shop_service_1.createDriverShopCode)(req.auth.activeOrganizationId, req.body.branchId, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Store code created", data);
}
async function listShopDriversController(req, res) {
    const branchId = req.query.branchId;
    if (branchId) {
        (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, branchId);
    }
    const normalized = req.membership ? (0, branchAccess_1.normalizeBranchAccess)(req.membership.branchAccess) : null;
    const branchIds = branchId ? [branchId] : normalized?.scope === "SELECTED" ? normalized.branchIds : undefined;
    const data = await (0, driver_shop_service_1.listShopDrivers)(req.auth.activeOrganizationId, branchIds);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Shop drivers fetched successfully", data);
}
async function removeShopDriverController(req, res) {
    const data = await (0, driver_shop_service_1.removeShopDriver)(req.auth.activeOrganizationId, req.params.driverId, req.auth.userId, (branchId) => (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, branchId));
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Driver removed from your shop", data);
}
