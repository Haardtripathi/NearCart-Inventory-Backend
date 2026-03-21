"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTaxRatesController = listTaxRatesController;
exports.createTaxRateController = createTaxRateController;
exports.updateTaxRateController = updateTaxRateController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
const tax_rates_service_1 = require("./tax-rates.service");
async function listTaxRatesController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, tax_rates_service_1.listTaxRates)(req.auth.activeOrganizationId, req.query, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Tax rates fetched successfully", data);
}
async function createTaxRateController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, tax_rates_service_1.createTaxRate)(req.auth.activeOrganizationId, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Tax rate created successfully", data);
}
async function updateTaxRateController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, tax_rates_service_1.updateTaxRate)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Tax rate updated successfully", data);
}
