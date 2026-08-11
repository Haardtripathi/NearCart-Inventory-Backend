import type { Request, Response } from "express";

import { assertBranchAccessOrThrow, normalizeBranchAccess } from "../../utils/branchAccess";
import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext } from "../../utils/localization";
import { createBranch, deleteBranch, getBranchById, listBranches, updateBranch } from "./branches.service";

// Independent-verification fix (2026-08-10): the branch record itself carries phone, email,
// full postal address, and pickup-point GPS lat/long (see branches.service.ts) — not just a
// display name — and `listBranches`/`getBranchById`/`updateBranch`/`deleteBranch` returned/acted
// on every branch in the org with zero regard for the caller's `branchAccess` allowlist, even
// after the sibling inventory/sales-orders/purchases/stock-transfers modules were fixed for the
// exact same class of bug. A branch-scoped STAFF/MANAGER could `GET /api/branches` and read every
// other branch's exact address, phone, and email, or (if MANAGER-roled) PATCH/DELETE a branch
// they have no access to. Since a branch's own `id` IS the branchId being checked, there's no
// separate record to load first for get/update/delete — the id in the route param is checked
// directly. `id` itself is what the list endpoint restricts to, unlike the other modules whose
// list queries filter on a `branchId` foreign key.

export async function listBranchesController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const normalized = req.membership ? normalizeBranchAccess(req.membership.branchAccess) : null;
  const accessibleBranchIds = normalized?.scope === "SELECTED" ? normalized.branchIds : undefined;
  const data = await listBranches(
    req.auth!.activeOrganizationId!,
    { ...req.query, accessibleBranchIds } as never,
    localeContext,
  );
  return sendSuccess(res, 200, "Branches fetched successfully", data);
}

export async function createBranchController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await createBranch(req.auth!.activeOrganizationId!, req.body, localeContext);
  return sendSuccess(res, 201, "Branch created successfully", data);
}

export async function getBranchController(req: Request, res: Response) {
  assertBranchAccessOrThrow(req.membership?.branchAccess, req.params.id!);
  const localeContext = await resolveLocaleContext(req);
  const data = await getBranchById(req.auth!.activeOrganizationId!, req.params.id!, localeContext);
  return sendSuccess(res, 200, "Branch fetched successfully", data);
}

export async function updateBranchController(req: Request, res: Response) {
  assertBranchAccessOrThrow(req.membership?.branchAccess, req.params.id!);
  const localeContext = await resolveLocaleContext(req);
  const data = await updateBranch(req.auth!.activeOrganizationId!, req.params.id!, req.body, localeContext);
  return sendSuccess(res, 200, "Branch updated successfully", data);
}

export async function deleteBranchController(req: Request, res: Response) {
  assertBranchAccessOrThrow(req.membership?.branchAccess, req.params.id!);
  const data = await deleteBranch(req.auth!.activeOrganizationId!, req.params.id!);
  return sendSuccess(res, 200, "Branch deleted successfully", data);
}
