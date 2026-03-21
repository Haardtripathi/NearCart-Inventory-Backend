"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUnitsController = listUnitsController;
exports.createUnitController = createUnitController;
exports.getUnitController = getUnitController;
exports.updateUnitController = updateUnitController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
const units_service_1 = require("./units.service");
async function listUnitsController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, units_service_1.listUnits)(req.auth.activeOrganizationId, req.query, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Units fetched successfully", data);
}
async function createUnitController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, units_service_1.createUnit)(req.auth.activeOrganizationId, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Unit created successfully", data);
}
async function getUnitController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, units_service_1.getUnitById)(req.auth.activeOrganizationId, req.params.id, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Unit fetched successfully", data);
}
async function updateUnitController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, units_service_1.updateUnit)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Unit updated successfully", data);
}
