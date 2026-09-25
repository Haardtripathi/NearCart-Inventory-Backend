import { Router } from "express";

import { apiRateLimiter } from "../../middlewares/rateLimit.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { autocompleteController, geocodeController, reverseGeocodeController } from "./location.controller";

export const locationRouter = Router();

// Public (no auth) but rate-limited — these proxy Google Maps Platform so the API key never
// reaches the client, and the limiter protects that key's quota from abuse. Must stay
// unauthenticated: the signup/onboarding shop-location step (RegisterScreen) uses this before an
// account exists.
locationRouter.get("/autocomplete", apiRateLimiter, asyncHandler(autocompleteController));
locationRouter.get("/geocode", apiRateLimiter, asyncHandler(geocodeController));
locationRouter.get("/reverse-geocode", apiRateLimiter, asyncHandler(reverseGeocodeController));
