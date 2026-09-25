"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translationRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const validate_middleware_1 = require("../../middlewares/validate.middleware");
const asyncHandler_1 = require("../../utils/asyncHandler");
const translation_controller_1 = require("./translation.controller");
const translation_validation_1 = require("./translation.validation");
exports.translationRouter = (0, express_1.Router)();
// Bug fix: this endpoint had no auth middleware at all, letting any unauthenticated caller
// trigger real LibreTranslate calls and populate the shared Redis translation cache (see
// backend/CLAUDE.md's note on this — flagged there as intent-unknown, not fixed at the time).
// No stated reason for it being open and no other route in this backend skips auth, so
// `authenticate` (same bar as every other authenticated org-staff endpoint) is the reasonable
// default: it doesn't need `requireOrganizationContext`/role gating since translation itself
// isn't org-scoped data, just any signed-in user rather than the whole internet.
exports.translationRouter.use(auth_middleware_1.authenticate);
exports.translationRouter.post("/", (0, validate_middleware_1.validateRequest)({ body: translation_validation_1.translateItemSchema }), (0, asyncHandler_1.asyncHandler)(translation_controller_1.translateItemController));
