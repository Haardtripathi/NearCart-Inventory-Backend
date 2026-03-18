"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUnitsController = listUnitsController;
exports.createUnitController = createUnitController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const units_service_1 = require("./units.service");
async function listUnitsController(req, res) {
    const data = await (0, units_service_1.listUnits)(req.auth.activeOrganizationId, req.query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Units fetched successfully", data);
}
async function createUnitController(req, res) {
    const data = await (0, units_service_1.createUnit)(req.auth.activeOrganizationId, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Unit created successfully", data);
}
