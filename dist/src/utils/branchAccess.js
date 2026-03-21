"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BRANCH_ACCESS_SCOPES = void 0;
exports.normalizeBranchAccess = normalizeBranchAccess;
exports.assertBranchAccessInOrganization = assertBranchAccessInOrganization;
exports.hasBranchAccess = hasBranchAccess;
const ApiError_1 = require("./ApiError");
exports.BRANCH_ACCESS_SCOPES = ["ALL", "SELECTED"];
function normalizeBranchAccess(input) {
    if (!input || typeof input !== "object") {
        return {
            scope: "ALL",
            branchIds: [],
        };
    }
    const scope = input.scope === "SELECTED" ? "SELECTED" : "ALL";
    const branchIds = Array.isArray(input.branchIds)
        ? Array.from(new Set(input.branchIds
            ?.map((branchId) => String(branchId).trim())
            .filter(Boolean) ?? []))
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
async function assertBranchAccessInOrganization(db, organizationId, branchAccess) {
    if (branchAccess.scope !== "SELECTED") {
        return branchAccess;
    }
    if (branchAccess.branchIds.length === 0) {
        throw ApiError_1.ApiError.badRequest("Select at least one branch when using limited branch access");
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
        throw ApiError_1.ApiError.badRequest("Branch access contains one or more invalid branches");
    }
    return branchAccess;
}
function hasBranchAccess(branchAccess, branchId) {
    const normalized = normalizeBranchAccess(branchAccess);
    return normalized.scope === "ALL" || normalized.branchIds.includes(branchId);
}
