"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDriverShopController = getDriverShopController;
exports.joinDriverShopController = joinDriverShopController;
exports.leaveDriverShopController = leaveDriverShopController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const driver_shop_service_1 = require("./driver-shop.service");
async function getDriverShopController(req, res) {
    const data = await (0, driver_shop_service_1.getDriverShop)(req.driverAuth.driverId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Shop fetched successfully", data);
}
async function joinDriverShopController(req, res) {
    const data = await (0, driver_shop_service_1.joinDriverShop)(req.driverAuth.driverId, req.body.storeCode);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "You joined the shop", data);
}
async function leaveDriverShopController(req, res) {
    const data = await (0, driver_shop_service_1.leaveDriverShop)(req.driverAuth.driverId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "You left the shop", data);
}
