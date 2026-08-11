import type { DbClient } from "../types/prisma";
import { ApiError } from "./ApiError";

export const BRANCH_ACCESS_SCOPES = ["ALL", "SELECTED"] as const;

export type BranchAccessScope = (typeof BRANCH_ACCESS_SCOPES)[number];

export interface BranchAccessState {
  scope: BranchAccessScope;
  branchIds: string[];
}

export function normalizeBranchAccess(input: unknown): BranchAccessState {
  if (!input || typeof input !== "object") {
    return {
      scope: "ALL",
      branchIds: [],
    };
  }

  const scope = (input as { scope?: BranchAccessScope }).scope === "SELECTED" ? "SELECTED" : "ALL";
  const branchIds = Array.isArray((input as { branchIds?: unknown[] }).branchIds)
    ? Array.from(
        new Set(
          (input as { branchIds?: unknown[] }).branchIds
            ?.map((branchId) => String(branchId).trim())
            .filter(Boolean) ?? [],
        ),
      )
    : [];

  if (scope === "ALL") {
    return {
      scope,
      branchIds: [],
    };
  }

  return {
    scope,
    branchIds,
  };
}

export async function assertBranchAccessInOrganization(
  db: DbClient,
  organizationId: string,
  branchAccess: BranchAccessState,
) {
  if (branchAccess.scope !== "SELECTED") {
    return branchAccess;
  }

  if (branchAccess.branchIds.length === 0) {
    throw ApiError.badRequest("Select at least one branch when using limited branch access");
  }

  const branches = await db.branch.findMany({
    where: {
      organizationId,
      id: {
        in: branchAccess.branchIds,
      },
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (branches.length !== branchAccess.branchIds.length) {
    throw ApiError.badRequest("Branch access contains one or more invalid branches");
  }

  return branchAccess;
}

export function hasBranchAccess(branchAccess: unknown, branchId: string) {
  const normalized = normalizeBranchAccess(branchAccess);
  return normalized.scope === "ALL" || normalized.branchIds.includes(branchId);
}

// Bug found live during the 2026-08-09 scenario sweep: `hasBranchAccess` above and
// `OrganizationMembership.branchAccess` (SELECTED scope + a branchIds allowlist) have existed
// since the Users module was built, but until now NOTHING outside users.service.ts/auth.service.ts
// ever called `hasBranchAccess` — confirmed by grep, zero call sites anywhere in
// inventory/sales-orders/purchases/stock-transfers. A STAFF/MANAGER member limited to one branch
// could read and, where their role allowed it, write every OTHER branch's inventory, sales
// orders, purchases, and transfers in the same org just by passing a different branchId —
// reproduced live: a STAFF user scoped to "Main Branch" only could GET
// /api/inventory/balances?branchId=<Warehouse> and get a 200 with that branch's real stock. The
// two helpers below are the actual enforcement, wired into each module's controller.

/**
 * Throws 403 if the given branchId isn't in the caller's allowed set. No-op (always allowed) when
 * `membershipBranchAccess` is `undefined` — that's the SUPER_ADMIN case (org.middleware.ts only
 * populates `req.membership` for non-SUPER_ADMIN callers), consistent with every other
 * SUPER_ADMIN bypass in this codebase.
 */
export function assertBranchAccessOrThrow(membershipBranchAccess: unknown | undefined, branchId: string) {
  if (membershipBranchAccess === undefined) {
    return;
  }

  if (!hasBranchAccess(membershipBranchAccess, branchId)) {
    throw ApiError.forbidden("You do not have access to this branch");
  }
}

/**
 * Resolves the effective branch filter for a LIST endpoint: validates an explicit branchId the
 * caller asked for (throws 403 if it's outside their access), or — when no explicit branchId was
 * requested and the caller is SELECTED-scoped — returns their allowed branchIds so the caller can
 * build a `branchId: { in: [...] }` filter instead of silently returning every branch in the org.
 * Returns `undefined` for "no filter needed" (SUPER_ADMIN, ALL-scope, or an explicit single id).
 */
export function resolveBranchFilter(
  membershipBranchAccess: unknown | undefined,
  requestedBranchId?: string,
): string | string[] | undefined {
  if (requestedBranchId) {
    assertBranchAccessOrThrow(membershipBranchAccess, requestedBranchId);
    return requestedBranchId;
  }

  if (membershipBranchAccess === undefined) {
    return undefined;
  }

  const normalized = normalizeBranchAccess(membershipBranchAccess);
  return normalized.scope === "ALL" ? undefined : normalized.branchIds;
}
