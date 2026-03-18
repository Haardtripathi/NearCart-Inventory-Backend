import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { bootstrapSuperAdminController, loginController, meController } from "./auth.controller";
import { bootstrapSuperAdminSchema, loginSchema } from "./auth.validation";

export const authRouter = Router();

authRouter.post(
  "/bootstrap-super-admin",
  validateRequest({ body: bootstrapSuperAdminSchema }),
  asyncHandler(bootstrapSuperAdminController),
);

authRouter.post("/login", validateRequest({ body: loginSchema }), asyncHandler(loginController));
authRouter.get("/me", authenticate, asyncHandler(meController));
