"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSalesOrdersController = listSalesOrdersController;
exports.createSalesOrderController = createSalesOrderController;
exports.getSalesOrderController = getSalesOrderController;
exports.updateSalesOrderController = updateSalesOrderController;
exports.confirmSalesOrderController = confirmSalesOrderController;
exports.rejectSalesOrderController = rejectSalesOrderController;
exports.cancelSalesOrderController = cancelSalesOrderController;
exports.deliverSalesOrderController = deliverSalesOrderController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const sales_orders_service_1 = require("./sales-orders.service");
async function listSalesOrdersController(req, res) {
    const data = await (0, sales_orders_service_1.listSalesOrders)(req.auth.activeOrganizationId, req.query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales orders fetched successfully", data);
}
async function createSalesOrderController(req, res) {
    const data = await (0, sales_orders_service_1.createSalesOrder)(req.auth.activeOrganizationId, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Sales order created successfully", data);
}
async function getSalesOrderController(req, res) {
    const data = await (0, sales_orders_service_1.getSalesOrderById)(req.auth.activeOrganizationId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order fetched successfully", data);
}
async function updateSalesOrderController(req, res) {
    const data = await (0, sales_orders_service_1.updateSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order updated successfully", data);
}
async function confirmSalesOrderController(req, res) {
    const data = await (0, sales_orders_service_1.confirmSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order confirmed successfully", data);
}
async function rejectSalesOrderController(req, res) {
    const data = await (0, sales_orders_service_1.rejectSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body.rejectionReason);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order rejected successfully", data);
}
async function cancelSalesOrderController(req, res) {
    const data = await (0, sales_orders_service_1.cancelSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order cancelled successfully", data);
}
async function deliverSalesOrderController(req, res) {
    const data = await (0, sales_orders_service_1.deliverSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order delivered successfully", data);
}
