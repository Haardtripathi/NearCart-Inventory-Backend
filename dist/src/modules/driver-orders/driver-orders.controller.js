"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDriverOrdersController = listDriverOrdersController;
exports.pickupDriverOrderController = pickupDriverOrderController;
exports.arriveDriverOrderController = arriveDriverOrderController;
exports.declineDriverOrderController = declineDriverOrderController;
exports.deliverDriverOrderController = deliverDriverOrderController;
exports.listDriverOrderHistoryController = listDriverOrderHistoryController;
exports.getDriverEarningsSummaryController = getDriverEarningsSummaryController;
exports.getDriverPerformanceSummaryController = getDriverPerformanceSummaryController;
exports.updateDriverAvailabilityController = updateDriverAvailabilityController;
exports.updateDriverLocationController = updateDriverLocationController;
exports.registerDriverDeviceTokenController = registerDriverDeviceTokenController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const driver_orders_service_1 = require("./driver-orders.service");
const EARNINGS_RANGES = ["today", "week", "month", "all"];
function parseEarningsRange(value) {
    return typeof value === "string" && EARNINGS_RANGES.includes(value)
        ? value
        : "today";
}
async function listDriverOrdersController(req, res) {
    const data = await (0, driver_orders_service_1.listDriverOrders)(req.driverAuth.driverId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Assigned orders fetched successfully", data);
}
async function pickupDriverOrderController(req, res) {
    const data = await (0, driver_orders_service_1.pickupDriverOrder)(req.driverAuth.driverId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Order picked up successfully", data);
}
async function arriveDriverOrderController(req, res) {
    const data = await (0, driver_orders_service_1.arriveDriverOrder)(req.driverAuth.driverId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Arrival recorded successfully", data);
}
async function declineDriverOrderController(req, res) {
    const data = await (0, driver_orders_service_1.declineDriverOrder)(req.driverAuth.driverId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Order declined successfully", data);
}
async function deliverDriverOrderController(req, res) {
    const photo = req.file ? { buffer: req.file.buffer, originalname: req.file.originalname } : undefined;
    const data = await (0, driver_orders_service_1.deliverDriverOrder)(req.driverAuth.driverId, req.params.id, photo);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Order delivered successfully", data);
}
async function listDriverOrderHistoryController(req, res) {
    const page = Number.parseInt(String(req.query.page ?? "1"), 10) || 1;
    const data = await (0, driver_orders_service_1.listDriverOrderHistory)(req.driverAuth.driverId, page);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Delivery history fetched successfully", data);
}
async function getDriverEarningsSummaryController(req, res) {
    const range = parseEarningsRange(req.query.range);
    const data = await (0, driver_orders_service_1.getDriverEarningsSummary)(req.driverAuth.driverId, range);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Earnings summary fetched successfully", data);
}
async function getDriverPerformanceSummaryController(req, res) {
    const range = parseEarningsRange(req.query.range);
    const data = await (0, driver_orders_service_1.getDriverPerformanceSummary)(req.driverAuth.driverId, range);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Performance summary fetched successfully", data);
}
async function updateDriverAvailabilityController(req, res) {
    const data = await (0, driver_orders_service_1.updateDriverAvailability)(req.driverAuth.driverId, req.body.isAvailableForAssignment);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Availability updated successfully", data);
}
async function updateDriverLocationController(req, res) {
    const data = await (0, driver_orders_service_1.updateDriverLocation)(req.driverAuth.driverId, req.body.latitude, req.body.longitude);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Location updated successfully", data);
}
async function registerDriverDeviceTokenController(req, res) {
    const data = await (0, driver_orders_service_1.registerDriverDeviceTokenForDriver)(req.driverAuth.driverId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Device token registered successfully", data);
}
