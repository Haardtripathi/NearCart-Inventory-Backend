import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { createUnitController, getUnitController, listUnitsController, updateUnitController } from "./units.controller";
import { createUnitSchema, unitQuerySchema, updateUnitSchema } from "./units.validation";

export const unitsRouter = Router();

unitsRouter.use(authenticate, requireOrganizationContext);

unitsRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: unitQuerySchema }), asyncHandler(listUnitsController));
unitsRouter.post("/", requireRoles(...MANAGER_ROLES), validateRequest({ body: createUnitSchema }), asyncHandler(createUnitController));
unitsRouter.get("/:id", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(getUnitController));
unitsRouter.patch("/:id", requireRoles(...MANAGER_ROLES), validateRequest({ body: updateUnitSchema }), asyncHandler(updateUnitController));
