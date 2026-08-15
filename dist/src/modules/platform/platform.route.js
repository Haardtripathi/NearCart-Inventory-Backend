"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformRouter = void 0;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const validate_middleware_1 = require("../../middlewares/validate.middleware");
const asyncHandler_1 = require("../../utils/asyncHandler");
const validation_1 = require("../../utils/validation");
const platform_controller_1 = require("./platform.controller");
const platform_validation_1 = require("./platform.validation");
exports.platformRouter = (0, express_1.Router)();
exports.platformRouter.get("/industries", (0, validate_middleware_1.validateRequest)({ query: platform_validation_1.industriesQuerySchema }), (0, asyncHandler_1.asyncHandler)(platform_controller_1.getIndustriesController));
exports.platformRouter.post("/industries", auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)(client_1.UserRole.SUPER_ADMIN), (0, validate_middleware_1.validateRequest)({ body: platform_validation_1.createIndustrySchema }), (0, asyncHandler_1.asyncHandler)(platform_controller_1.createIndustryController));
exports.platformRouter.patch("/industries/:id", auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)(client_1.UserRole.SUPER_ADMIN), (0, validate_middleware_1.validateRequest)({ body: platform_validation_1.updateIndustrySchema }), (0, asyncHandler_1.asyncHandler)(platform_controller_1.updateIndustryController));
// Platform-wide organization list — SUPER_ADMIN only, used both by the web PlatformOrganizations
// page and the mobile app's org-picker for a SUPER_ADMIN (who has no org membership to derive a
// list from). Contract fixed ahead of this endpoint existing — see frontend's
// src/types/platform.ts / src/features/platform/platform.api.ts.
exports.platformRouter.get("/organizations", auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)(client_1.UserRole.SUPER_ADMIN), (0, asyncHandler_1.asyncHandler)(platform_controller_1.getPlatformOrganizationsController));
// Platform-admin driver verification — see PHASE1_REQUIREMENTS.md's "Driver API contract".
exports.platformRouter.get("/drivers", auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)(client_1.UserRole.SUPER_ADMIN), (0, validate_middleware_1.validateRequest)({ query: platform_validation_1.platformDriversQuerySchema }), (0, asyncHandler_1.asyncHandler)(platform_controller_1.getPlatformDriversController));
exports.platformRouter.patch("/drivers/:id/verify", auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)(client_1.UserRole.SUPER_ADMIN), (0, validate_middleware_1.validateRequest)({ params: validation_1.idParamSchema }), (0, asyncHandler_1.asyncHandler)(platform_controller_1.verifyPlatformDriverController));
exports.platformRouter.patch("/drivers/:id/suspend", auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)(client_1.UserRole.SUPER_ADMIN), (0, validate_middleware_1.validateRequest)({ params: validation_1.idParamSchema }), (0, asyncHandler_1.asyncHandler)(platform_controller_1.suspendPlatformDriverController));
