"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSuppliersController = listSuppliersController;
exports.createSupplierController = createSupplierController;
exports.getSupplierController = getSupplierController;
exports.updateSupplierController = updateSupplierController;
exports.deleteSupplierController = deleteSupplierController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
const suppliers_service_1 = require("./suppliers.service");
async function listSuppliersController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, suppliers_service_1.listSuppliers)(req.auth.activeOrganizationId, req.query, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Suppliers fetched successfully", data);
}
async function createSupplierController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, suppliers_service_1.createSupplier)(req.auth.activeOrganizationId, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Supplier created successfully", data);
}
async function getSupplierController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, suppliers_service_1.getSupplierById)(req.auth.activeOrganizationId, req.params.id, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Supplier fetched successfully", data);
}
async function updateSupplierController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, suppliers_service_1.updateSupplier)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Supplier updated successfully", data);
}
async function deleteSupplierController(req, res) {
    const data = await (0, suppliers_service_1.deleteSupplier)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Supplier deleted successfully", data);
}
