import { Router } from "express";

import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  loginDriverController,
  logoutDriverController,
  refreshDriverTokenController,
  registerDriverController,
} from "./driver-auth.controller";
import {
  loginDriverSchema,
  logoutDriverSchema,
  refreshDriverTokenSchema,
  registerDriverSchema,
} from "./driver-auth.validation";

export const driverAuthRouter = Router();

driverAuthRouter.post(
  "/register",
  validateRequest({ body: registerDriverSchema }),
  asyncHandler(registerDriverController),
);
driverAuthRouter.post("/login", validateRequest({ body: loginDriverSchema }), asyncHandler(loginDriverController));
driverAuthRouter.post(
  "/refresh",
  validateRequest({ body: refreshDriverTokenSchema }),
  asyncHandler(refreshDriverTokenController),
);
driverAuthRouter.post(
  "/logout",
  validateRequest({ body: logoutDriverSchema }),
  asyncHandler(logoutDriverController),
);
