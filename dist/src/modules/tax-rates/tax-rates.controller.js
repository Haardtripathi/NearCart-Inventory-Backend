"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTaxRatesController = listTaxRatesController;
exports.createTaxRateController = createTaxRateController;
exports.updateTaxRateController = updateTaxRateController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const tax_rates_service_1 = require("./tax-rates.service");
async function listTaxRatesController(req, res) {
    const data = await (0, tax_rates_service_1.listTaxRates)(req.auth.activeOrganizationId, req.query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Tax rates fetched successfully", data);
}
async function createTaxRateController(req, res) {
    const data = await (0, tax_rates_service_1.createTaxRate)(req.auth.activeOrganizationId, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Tax rate created successfully", data);
}
async function updateTaxRateController(req, res) {
    const data = await (0, tax_rates_service_1.updateTaxRate)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Tax rate updated successfully", data);
}
