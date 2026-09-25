"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopStatusRouter = void 0;
const express_1 = require("express");
const roles_1 = require("../../constants/roles");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const org_middleware_1 = require("../../middlewares/org.middleware");
const validate_middleware_1 = require("../../middlewares/validate.middleware");
const asyncHandler_1 = require("../../utils/asyncHandler");
const shop_status_controller_1 = require("./shop-status.controller");
const shop_status_validation_1 = require("./shop-status.validation");
exports.shopStatusRouter = (0, express_1.Router)();
exports.shopStatusRouter.use(auth_middleware_1.authenticate, org_middleware_1.requireOrganizationContext);
// Reading is open to any org member (staff need to see whether the shop is taking orders);
// flipping it is a MANAGER-and-up decision, same bar as confirming/rejecting a sales order.
exports.shopStatusRouter.get("/", (0, auth_middleware_1.requireRoles)(...roles_1.READ_WRITE_STAFF_ROLES), (0, validate_middleware_1.validateRequest)({ query: shop_status_validation_1.shopStatusQuerySchema }), (0, asyncHandler_1.asyncHandler)(shop_status_controller_1.getShopStatusController));
exports.shopStatusRouter.patch("/", (0, auth_middleware_1.requireRoles)(...roles_1.MANAGER_ROLES), (0, validate_middleware_1.validateRequest)({ body: shop_status_validation_1.updateShopStatusSchema }), (0, asyncHandler_1.asyncHandler)(shop_status_controller_1.updateShopStatusController));
