"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAssignableDriversController = listAssignableDriversController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const drivers_service_1 = require("./drivers.service");
async function listAssignableDriversController(req, res) {
    const data = await (0, drivers_service_1.listAssignableDrivers)(req.query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Drivers fetched successfully", data);
}
