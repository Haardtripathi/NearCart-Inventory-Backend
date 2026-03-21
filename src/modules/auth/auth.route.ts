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
authRouter.post("/logout", authenticate, asyncHandler(async (req, res) => {
  // For JWT-based auth, logout can be handled on the client side by deleting the token.
  // Optionally, you can implement token blacklisting here if needed.
  res.status(204).send();
}));

authRouter.get("/me", authenticate, asyncHandler(meController));
