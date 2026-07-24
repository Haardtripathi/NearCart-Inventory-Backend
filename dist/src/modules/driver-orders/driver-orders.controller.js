"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDriverOrdersController = listDriverOrdersController;
exports.pickupDriverOrderController = pickupDriverOrderController;
exports.deliverDriverOrderController = deliverDriverOrderController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const driver_orders_service_1 = require("./driver-orders.service");
async function listDriverOrdersController(req, res) {
    const data = await (0, driver_orders_service_1.listDriverOrders)(req.driverAuth.driverId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Assigned orders fetched successfully", data);
}
async function pickupDriverOrderController(req, res) {
    const data = await (0, driver_orders_service_1.pickupDriverOrder)(req.driverAuth.driverId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Order picked up successfully", data);
}
async function deliverDriverOrderController(req, res) {
    const data = await (0, driver_orders_service_1.deliverDriverOrder)(req.driverAuth.driverId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Order delivered successfully", data);
}
