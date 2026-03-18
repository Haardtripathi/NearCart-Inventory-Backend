import { Router } from "express";

import { MANAGER_ROLES, READ_WRITE_STAFF_ROLES } from "../../constants/roles";
import { authenticate, requireRoles } from "../../middlewares/auth.middleware";
import { requireOrganizationContext } from "../../middlewares/org.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createBranchController,
  deleteBranchController,
  getBranchController,
  listBranchesController,
  updateBranchController,
} from "./branches.controller";
import { branchQuerySchema, createBranchSchema, updateBranchSchema } from "./branches.validation";

export const branchesRouter = Router();

branchesRouter.use(authenticate, requireOrganizationContext);

branchesRouter.get("/", requireRoles(...READ_WRITE_STAFF_ROLES), validateRequest({ query: branchQuerySchema }), asyncHandler(listBranchesController));
branchesRouter.post("/", requireRoles(...MANAGER_ROLES), validateRequest({ body: createBranchSchema }), asyncHandler(createBranchController));
branchesRouter.get("/:id", requireRoles(...READ_WRITE_STAFF_ROLES), asyncHandler(getBranchController));
branchesRouter.patch("/:id", requireRoles(...MANAGER_ROLES), validateRequest({ body: updateBranchSchema }), asyncHandler(updateBranchController));
branchesRouter.delete("/:id", requireRoles(...MANAGER_ROLES), asyncHandler(deleteBranchController));
