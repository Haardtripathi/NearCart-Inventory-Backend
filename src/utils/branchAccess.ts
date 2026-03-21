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
