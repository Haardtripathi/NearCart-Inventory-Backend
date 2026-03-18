import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { createTaxRateController, listTaxRatesController, updateTaxRateController } from "./tax-rates.controller";
import { createTaxRateSchema, taxRateQuerySchema, updateTaxRateSchema } from "./tax-rates.validation";

export const taxRatesRouter = Router();

taxRatesRouter.use(authenticate, requireOrganizationContext);

taxRatesRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: taxRateQuerySchema }), asyncHandler(listTaxRatesController));
taxRatesRouter.post("/", requireRoles(...MANAGER_ROLES), validateRequest({ body: createTaxRateSchema }), asyncHandler(createTaxRateController));
taxRatesRouter.patch("/:id", requireRoles(...MANAGER_ROLES), validateRequest({ body: updateTaxRateSchema }), asyncHandler(updateTaxRateController));
