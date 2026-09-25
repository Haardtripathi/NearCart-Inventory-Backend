"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.driversRouter = void 0;
const express_1 = require("express");
const roles_1 = require("../../constants/roles");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const org_middleware_1 = require("../../middlewares/org.middleware");
const validate_middleware_1 = require("../../middlewares/validate.middleware");
const asyncHandler_1 = require("../../utils/asyncHandler");
const drivers_controller_1 = require("./drivers.controller");
const drivers_validation_1 = require("./drivers.validation");
exports.driversRouter = (0, express_1.Router)();
exports.driversRouter.use(auth_middleware_1.authenticate, org_middleware_1.requireOrganizationContext);
exports.driversRouter.get("/", (0, auth_middleware_1.requireRoles)(...roles_1.MANAGER_ROLES), (0, validate_middleware_1.validateRequest)({ query: drivers_validation_1.listAssignableDriversQuerySchema }), (0, asyncHandler_1.asyncHandler)(drivers_controller_1.listAssignableDriversController));
// Shop-owned drivers (2026-09-24) — see driver-shop.service.ts.
exports.driversRouter.post("/shop-codes", (0, auth_middleware_1.requireRoles)(...roles_1.MANAGER_ROLES), (0, validate_middleware_1.validateRequest)({ body: drivers_validation_1.createDriverShopCodeSchema }), (0, asyncHandler_1.asyncHandler)(drivers_controller_1.createDriverShopCodeController));
exports.driversRouter.get("/shop", (0, auth_middleware_1.requireRoles)(...roles_1.MANAGER_ROLES), (0, validate_middleware_1.validateRequest)({ query: drivers_validation_1.listShopDriversQuerySchema }), (0, asyncHandler_1.asyncHandler)(drivers_controller_1.listShopDriversController));
exports.driversRouter.delete("/shop/:driverId", (0, auth_middleware_1.requireRoles)(...roles_1.MANAGER_ROLES), (0, validate_middleware_1.validateRequest)({ params: drivers_validation_1.shopDriverParamsSchema }), (0, asyncHandler_1.asyncHandler)(drivers_controller_1.removeShopDriverController));
