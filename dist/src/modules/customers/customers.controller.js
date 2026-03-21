"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCustomersController = listCustomersController;
exports.createCustomerController = createCustomerController;
exports.getCustomerController = getCustomerController;
exports.updateCustomerController = updateCustomerController;
exports.deleteCustomerController = deleteCustomerController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
const customers_service_1 = require("./customers.service");
async function listCustomersController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, customers_service_1.listCustomers)(req.auth.activeOrganizationId, req.query, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Customers fetched successfully", data);
}
async function createCustomerController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, customers_service_1.createCustomer)(req.auth.activeOrganizationId, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Customer created successfully", data);
}
async function getCustomerController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, customers_service_1.getCustomerById)(req.auth.activeOrganizationId, req.params.id, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Customer fetched successfully", data);
}
async function updateCustomerController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, customers_service_1.updateCustomer)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Customer updated successfully", data);
}
async function deleteCustomerController(req, res) {
    const data = await (0, customers_service_1.deleteCustomer)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Customer deleted successfully", data);
}
