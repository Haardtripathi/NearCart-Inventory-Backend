"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationsRouter = void 0;
const express_1 = require("express");
const roles_1 = require("../../constants/roles");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const org_middleware_1 = require("../../middlewares/org.middleware");
const validate_middleware_1 = require("../../middlewares/validate.middleware");
const asyncHandler_1 = require("../../utils/asyncHandler");
const organizations_controller_1 = require("./organizations.controller");
const organizations_validation_1 = require("./organizations.validation");
exports.organizationsRouter = (0, express_1.Router)();
exports.organizationsRouter.use(auth_middleware_1.authenticate);
exports.organizationsRouter.post("/", auth_middleware_1.requireEmailVerified, (0, validate_middleware_1.validateRequest)({ body: organizations_validation_1.createOrganizationSchema }), (0, asyncHandler_1.asyncHandler)(organizations_controller_1.createOrganizationController));
exports.organizationsRouter.get("/my", (0, asyncHandler_1.asyncHandler)(organizations_controller_1.getMyOrganizationsController));
// Sidebar page-visibility settings for the caller's active organization. Registered before the
// `/:id` routes below so the literal "page-visibility" segment isn't swallowed as an :id param.
exports.organizationsRouter.get("/page-visibility", org_middleware_1.requireOrganizationContext, (0, auth_middleware_1.requireRoles)(...roles_1.ADMIN_ROLES), (0, asyncHandler_1.asyncHandler)(organizations_controller_1.getEnabledPagesController));
exports.organizationsRouter.patch("/page-visibility", org_middleware_1.requireOrganizationContext, (0, auth_middleware_1.requireRoles)(...roles_1.ADMIN_ROLES), (0, validate_middleware_1.validateRequest)({ body: organizations_validation_1.updateEnabledPagesSchema }), (0, asyncHandler_1.asyncHandler)(organizations_controller_1.updateEnabledPagesController));
exports.organizationsRouter.post("/:id/industries", (0, validate_middleware_1.validateRequest)({ body: organizations_validation_1.addOrganizationIndustrySchema }), (0, asyncHandler_1.asyncHandler)(organizations_controller_1.addIndustryToOrganizationController));
exports.organizationsRouter.get("/:id", (0, asyncHandler_1.asyncHandler)(organizations_controller_1.getOrganizationByIdController));
