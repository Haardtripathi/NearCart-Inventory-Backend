import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { translateItemController } from "./translation.controller";
import { translateItemSchema } from "./translation.validation";

export const translationRouter = Router();

// Bug fix: this endpoint had no auth middleware at all, letting any unauthenticated caller
// trigger real LibreTranslate calls and populate the shared Redis translation cache (see
// backend/CLAUDE.md's note on this — flagged there as intent-unknown, not fixed at the time).
// No stated reason for it being open and no other route in this backend skips auth, so
// `authenticate` (same bar as every other authenticated org-staff endpoint) is the reasonable
// default: it doesn't need `requireOrganizationContext`/role gating since translation itself
// isn't org-scoped data, just any signed-in user rather than the whole internet.
translationRouter.use(authenticate);

translationRouter.post("/", validateRequest({ body: translateItemSchema }), asyncHandler(translateItemController));
