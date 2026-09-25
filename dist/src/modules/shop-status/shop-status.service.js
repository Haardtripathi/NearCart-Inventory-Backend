"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShopStatus = getShopStatus;
exports.updateShopStatus = updateShopStatus;
const client_1 = require("@prisma/client");
const env_1 = require("../../config/env");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const branchAccess_1 = require("../../utils/branchAccess");
const audit_service_1 = require("../audit/audit.service");
const NEARCART_TIMEOUT_MS = 8000;
const UNREACHABLE_MESSAGE = "Couldn't reach the NearCart marketplace. Try again.";
const NOT_LINKED_MESSAGE = "This shop isn't listed on NearCart yet.";
const TODAY_STATUS_PATH = "/api/internal/shops/today-status";
const NEARCART_NOT_LINKED_CODE = "SHOP_NOT_LINKED";
async function callNearCart(method, query, body) {
    if (!env_1.env.NEARCART_SERVICE_URL || !env_1.env.MARKETPLACE_INTERNAL_TOKEN) {
        console.warn("[shop-status] NearCart service URL/token not configured — cannot reach the marketplace.");
        throw ApiError_1.ApiError.serviceUnavailable(UNREACHABLE_MESSAGE);
    }
    const url = new URL(TODAY_STATUS_PATH, env_1.env.NEARCART_SERVICE_URL);
    for (const [key, value] of Object.entries(query)) {
        if (value) {
            url.searchParams.set(key, value);
        }
    }
    let response;
    try {
        response = await fetch(url.toString(), {
            method,
            headers: {
                "Content-Type": "application/json",
                "x-internal-service-token": env_1.env.MARKETPLACE_INTERNAL_TOKEN,
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(NEARCART_TIMEOUT_MS),
        });
    }
    catch (error) {
        console.warn(`[shop-status] ${method} ${TODAY_STATUS_PATH} failed to reach NearCart`, error);
        throw ApiError_1.ApiError.serviceUnavailable(UNREACHABLE_MESSAGE);
    }
    if (response.status === 404) {
        // Only NearCart's explicit "no shop linked to this org" 404 means "not listed". A bare 404 is
        // a NearCart build that predates these endpoints (unknown route) — telling the owner their
        // shop "isn't listed" in that case would be wrong, so it falls through to the 503 below.
        const payload = (await response.json().catch(() => null));
        if (payload?.details?.code === NEARCART_NOT_LINKED_CODE) {
            return { status: 404, items: [] };
        }
    }
    if (!response.ok) {
        // Anything else (403 token mismatch, 5xx, a NearCart build that predates these endpoints…) is
        // an integration fault the shop owner can't act on — log the real status, show the calm one.
        console.warn(`[shop-status] NearCart returned ${response.status} for ${method} ${TODAY_STATUS_PATH}`);
        throw ApiError_1.ApiError.serviceUnavailable(UNREACHABLE_MESSAGE);
    }
    try {
        const payload = (await response.json());
        return { status: response.status, items: Array.isArray(payload.items) ? payload.items : [] };
    }
    catch (error) {
        console.warn(`[shop-status] NearCart sent an unreadable ${method} ${TODAY_STATUS_PATH} response`, error);
        throw ApiError_1.ApiError.serviceUnavailable(UNREACHABLE_MESSAGE);
    }
}
/**
 * Applies the caller's branch-scoped access (utils/branchAccess.ts) to a shop-status request.
 * An explicit branchId is validated (403 if outside their allowlist). With no branchId, an
 * ALL-scope/SUPER_ADMIN caller addresses the whole org; a SELECTED-scope caller is narrowed to
 * their allowed branches — returned as `allowedBranchIds` so results can be filtered, since
 * NearCart's endpoint takes at most one branchId.
 */
function resolveScope(membershipBranchAccess, requestedBranchId) {
    const filter = (0, branchAccess_1.resolveBranchFilter)(membershipBranchAccess, requestedBranchId);
    if (typeof filter === "string") {
        return { branchId: filter, allowedBranchIds: undefined };
    }
    if (Array.isArray(filter)) {
        return filter.length === 1
            ? { branchId: filter[0], allowedBranchIds: undefined }
            : { branchId: undefined, allowedBranchIds: filter };
    }
    return { branchId: undefined, allowedBranchIds: undefined };
}
// A NearCart shop linked to the org with no specific branch is the org's single storefront —
// visible to every member regardless of branch scope (NearCart applies the same rule when
// narrowing by branchId).
function filterToAllowedBranches(items, allowedBranchIds) {
    if (!allowedBranchIds) {
        return items;
    }
    return items.filter((item) => item.inventoryBranchId === null || allowedBranchIds.includes(item.inventoryBranchId));
}
async function getShopStatus(organizationId, membershipBranchAccess, requestedBranchId) {
    const scope = resolveScope(membershipBranchAccess, requestedBranchId);
    const result = await callNearCart("GET", { organizationId, branchId: scope.branchId });
    const items = filterToAllowedBranches(result.items, scope.allowedBranchIds);
    if (items.length === 0) {
        throw ApiError_1.ApiError.notFound(NOT_LINKED_MESSAGE);
    }
    return { items };
}
async function updateShopStatus(organizationId, actorUserId, membershipBranchAccess, input) {
    const scope = resolveScope(membershipBranchAccess, input.branchId);
    // NearCart's PATCH updates every shop matching (org, branch?) — a caller limited to several
    // branches can't be expressed as one such call, so they must say which branch they mean rather
    // than this silently flipping branches they have no access to.
    if (scope.allowedBranchIds) {
        const access = (0, branchAccess_1.normalizeBranchAccess)(membershipBranchAccess);
        throw ApiError_1.ApiError.badRequest(access.branchIds.length === 0
            ? "You do not have access to any branch"
            : "Choose a branch to open or close");
    }
    // Snapshot for the audit trail's `before` — best-effort; the PATCH below is the real action.
    const before = await callNearCart("GET", { organizationId, branchId: scope.branchId });
    if (before.status === 404 || before.items.length === 0) {
        throw ApiError_1.ApiError.notFound(NOT_LINKED_MESSAGE);
    }
    const reason = input.isOpen ? undefined : input.reason?.trim() || undefined;
    const result = await callNearCart("PATCH", {}, {
        organizationId,
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
        isOpen: input.isOpen,
        ...(reason ? { reason } : {}),
        ...(input.isOpen && input.openingTime ? { openingTime: input.openingTime } : {}),
        ...(input.isOpen && input.closingTime ? { closingTime: input.closingTime } : {}),
    });
    if (result.status === 404 || result.items.length === 0) {
        throw ApiError_1.ApiError.notFound(NOT_LINKED_MESSAGE);
    }
    // AuditAction has no dedicated value for this and adding one needs a DB migration — a plain
    // UPDATE on a "ShopTodayStatus" entity carries everything needed (who, open/closed, reason).
    // Never let a failed audit write undo/mask a change that already happened on NearCart.
    try {
        for (const item of result.items) {
            const previous = before.items.find((candidate) => candidate.shopId === item.shopId);
            await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
                organizationId,
                actorUserId,
                action: client_1.AuditAction.UPDATE,
                entityType: "ShopTodayStatus",
                entityId: item.shopId,
                before: previous
                    ? { todayStatus: previous.todayStatus, todayStatusReason: previous.todayStatusReason }
                    : null,
                after: { todayStatus: item.todayStatus, todayStatusReason: item.todayStatusReason },
                meta: { shopName: item.name, branchId: scope.branchId ?? null, source: "NEARCART_MARKETPLACE" },
            });
        }
    }
    catch (error) {
        console.warn("[shop-status] Failed to write audit log for shop today-status change", error);
    }
    return { items: result.items };
}
