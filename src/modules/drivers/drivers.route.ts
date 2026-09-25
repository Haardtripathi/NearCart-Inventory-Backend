import { Router } from "express";

import { MANAGER_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createDriverShopCodeController,
  listAssignableDriversController,
  listShopDriversController,
  removeShopDriverController,
} from "./drivers.controller";
import {
  createDriverShopCodeSchema,
  listAssignableDriversQuerySchema,
  listShopDriversQuerySchema,
  shopDriverParamsSchema,
} from "./drivers.validation";

export const driversRouter = Router();

driversRouter.use(authenticate, requireOrganizationContext);

driversRouter.get(
  "/",
  requireRoles(...MANAGER_ROLES),
  validateRequest({ query: listAssignableDriversQuerySchema }),
  asyncHandler(listAssignableDriversController),
);

// Shop-owned drivers (2026-09-24) — see driver-shop.service.ts.
driversRouter.post(
  "/shop-codes",
  requireRoles(...MANAGER_ROLES),
  validateRequest({ body: createDriverShopCodeSchema }),
  asyncHandler(createDriverShopCodeController),
);
driversRouter.get(
  "/shop",
  requireRoles(...MANAGER_ROLES),
  validateRequest({ query: listShopDriversQuerySchema }),
  asyncHandler(listShopDriversController),
);
driversRouter.delete(
  "/shop/:driverId",
  requireRoles(...MANAGER_ROLES),
  validateRequest({ params: shopDriverParamsSchema }),
  asyncHandler(removeShopDriverController),
);
