"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.locationRouter = void 0;
const express_1 = require("express");
const rateLimit_middleware_1 = require("../../middlewares/rateLimit.middleware");
const asyncHandler_1 = require("../../utils/asyncHandler");
const location_controller_1 = require("./location.controller");
exports.locationRouter = (0, express_1.Router)();
// Public (no auth) but rate-limited — these proxy Google Maps Platform so the API key never
// reaches the client, and the limiter protects that key's quota from abuse. Must stay
// unauthenticated: the signup/onboarding shop-location step (RegisterScreen) uses this before an
// account exists.
exports.locationRouter.get("/autocomplete", rateLimit_middleware_1.apiRateLimiter, (0, asyncHandler_1.asyncHandler)(location_controller_1.autocompleteController));
exports.locationRouter.get("/geocode", rateLimit_middleware_1.apiRateLimiter, (0, asyncHandler_1.asyncHandler)(location_controller_1.geocodeController));
exports.locationRouter.get("/reverse-geocode", rateLimit_middleware_1.apiRateLimiter, (0, asyncHandler_1.asyncHandler)(location_controller_1.reverseGeocodeController));
