import { Router } from "express";

import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { translateItemController } from "./translation.controller";
import { translateItemSchema } from "./translation.validation";

export const translationRouter = Router();

translationRouter.post("/", validateRequest({ body: translateItemSchema }), asyncHandler(translateItemController));
