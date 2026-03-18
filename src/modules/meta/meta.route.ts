import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { getLocalizationContextController, getSupportedLanguagesController } from "./meta.controller";

export const metaRouter = Router();

metaRouter.get("/languages", asyncHandler(getSupportedLanguagesController));
metaRouter.get("/localization-context", authenticate, asyncHandler(getLocalizationContextController));
