import { AuditAction } from "@prisma/client";

import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { normalizeBranchAccess, resolveBranchFilter } from "../../utils/branchAccess";
import { createAuditLog } from "../audit/audit.service";
import type { UpdateShopStatusInput } from "./shop-status.validation";

/**
 * Daily "is the shop open today" switch, proxied to NearCart.
 *
 * The flag itself lives on NearCart's `Shop` row (`isOpenToday` / `todayStatusUpdatedAt` — see
 * NearCart/backend/src/utils/shop-availability.ts): until the owner confirms "open" each UTC day
 * the shop reads PENDING_CONFIRMATION and every customer cart-validate/checkout is rejected.
 * NearCart only exposed that switch on its own web shop-owner login, but real shop owners live in
 * THIS app (the Partner mobile app only talks to this backend) — so this module forwards it to
 * NearCart's internal `/api/internal/shops/today-status` endpoints, addressed by our organization
 * (+ optional branch) id, which NearCart maps via `Shop.inventoryOrganizationId/BranchId`.
 *
 * Same outbound client conventions as services/order-event-webhook.service.ts (same base URL env,
 * same shared secret + header) — but NOT fire-and-forget: here the NearCart call IS the primary
 * action, so failures are surfaced as friendly ApiErrors instead of being swallowed.
 */

type ShopTodayStatus = "OPEN" | "CLOSED" | "PENDING_CONFIRMATION";

interface ShopStatusItem {
  shopId: string;
  name: string;
  slug: string;
  inventoryBranchId: string | null;
  todayStatus: ShopTodayStatus;
  isOpenToday: boolean | null;
  todayStatusReason: string | null;
  todayStatusUpdatedAt: string | null;
  openingTime?: string | null;
  closingTime?: string | null;
}

const NEARCART_TIMEOUT_MS = 8000;
const UNREACHABLE_MESSAGE = "Couldn't reach the NearCart marketplace. Try again.";
const NOT_LINKED_MESSAGE = "This shop isn't listed on NearCart yet.";
const TODAY_STATUS_PATH = "/api/internal/shops/today-status";
const NEARCART_NOT_LINKED_CODE = "SHOP_NOT_LINKED";

async function callNearCart(
  method: "GET" | "PATCH",
  query: Record<string, string | undefined>,
  body?: Record<string, unknown>,
): Promise<{ status: number; items: ShopStatusItem[] }> {
  if (!env.NEARCART_SERVICE_URL || !env.MARKETPLACE_INTERNAL_TOKEN) {
    console.warn("[shop-status] NearCart service URL/token not configured — cannot reach the marketplace.");
    throw ApiError.serviceUnavailable(UNREACHABLE_MESSAGE);
  }

  const url = new URL(TODAY_STATUS_PATH, env.NEARCART_SERVICE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  let response: globalThis.Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-internal-service-token": env.MARKETPLACE_INTERNAL_TOKEN,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(NEARCART_TIMEOUT_MS),
    });
  } catch (error) {
    console.warn(`[shop-status] ${method} ${TODAY_STATUS_PATH} failed to reach NearCart`, error);
    throw ApiError.serviceUnavailable(UNREACHABLE_MESSAGE);
  }

  if (response.status === 404) {
    // Only NearCart's explicit "no shop linked to this org" 404 means "not listed". A bare 404 is
    // a NearCart build that predates these endpoints (unknown route) — telling the owner their
    // shop "isn't listed" in that case would be wrong, so it falls through to the 503 below.
    const payload = (await response.json().catch(() => null)) as { details?: { code?: string } } | null;
    if (payload?.details?.code === NEARCART_NOT_LINKED_CODE) {
      return { status: 404, items: [] };
    }
  }

  if (!response.ok) {
    // Anything else (403 token mismatch, 5xx, a NearCart build that predates these endpoints…) is
    // an integration fault the shop owner can't act on — log the real status, show the calm one.
    console.warn(`[shop-status] NearCart returned ${response.status} for ${method} ${TODAY_STATUS_PATH}`);
    throw ApiError.serviceUnavailable(UNREACHABLE_MESSAGE);
  }

  try {
    const payload = (await response.json()) as { items?: ShopStatusItem[] };
    return { status: response.status, items: Array.isArray(payload.items) ? payload.items : [] };
  } catch (error) {
    console.warn(`[shop-status] NearCart sent an unreadable ${method} ${TODAY_STATUS_PATH} response`, error);
    throw ApiError.serviceUnavailable(UNREACHABLE_MESSAGE);
  }
}

/**
 * Applies the caller's branch-scoped access (utils/branchAccess.ts) to a shop-status request.
 * An explicit branchId is validated (403 if outside their allowlist). With no branchId, an
 * ALL-scope/SUPER_ADMIN caller addresses the whole org; a SELECTED-scope caller is narrowed to
 * their allowed branches — returned as `allowedBranchIds` so results can be filtered, since
 * NearCart's endpoint takes at most one branchId.
 */
function resolveScope(membershipBranchAccess: unknown | undefined, requestedBranchId?: string) {
  const filter = resolveBranchFilter(membershipBranchAccess, requestedBranchId);

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
function filterToAllowedBranches(items: ShopStatusItem[], allowedBranchIds: string[] | undefined) {
  if (!allowedBranchIds) {
    return items;
  }

  return items.filter((item) => item.inventoryBranchId === null || allowedBranchIds.includes(item.inventoryBranchId));
}

export async function getShopStatus(
  organizationId: string,
  membershipBranchAccess: unknown | undefined,
  requestedBranchId?: string,
) {
  const scope = resolveScope(membershipBranchAccess, requestedBranchId);
  const result = await callNearCart("GET", { organizationId, branchId: scope.branchId });
  const items = filterToAllowedBranches(result.items, scope.allowedBranchIds);

  if (items.length === 0) {
    throw ApiError.notFound(NOT_LINKED_MESSAGE);
  }

  return { items };
}

export async function updateShopStatus(
  organizationId: string,
  actorUserId: string,
  membershipBranchAccess: unknown | undefined,
  input: UpdateShopStatusInput,
) {
  const scope = resolveScope(membershipBranchAccess, input.branchId);

  // NearCart's PATCH updates every shop matching (org, branch?) — a caller limited to several
  // branches can't be expressed as one such call, so they must say which branch they mean rather
  // than this silently flipping branches they have no access to.
  if (scope.allowedBranchIds) {
    const access = normalizeBranchAccess(membershipBranchAccess);
    throw ApiError.badRequest(
      access.branchIds.length === 0
        ? "You do not have access to any branch"
        : "Choose a branch to open or close",
    );
  }

  // Snapshot for the audit trail's `before` — best-effort; the PATCH below is the real action.
  const before = await callNearCart("GET", { organizationId, branchId: scope.branchId });
  if (before.status === 404 || before.items.length === 0) {
    throw ApiError.notFound(NOT_LINKED_MESSAGE);
  }

  const reason = input.isOpen ? undefined : input.reason?.trim() || undefined;
  const result = await callNearCart(
    "PATCH",
    {},
    {
      organizationId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      isOpen: input.isOpen,
      ...(reason ? { reason } : {}),
      ...(input.isOpen && input.openingTime ? { openingTime: input.openingTime } : {}),
      ...(input.isOpen && input.closingTime ? { closingTime: input.closingTime } : {}),
    },
  );

  if (result.status === 404 || result.items.length === 0) {
    throw ApiError.notFound(NOT_LINKED_MESSAGE);
  }

  // AuditAction has no dedicated value for this and adding one needs a DB migration — a plain
  // UPDATE on a "ShopTodayStatus" entity carries everything needed (who, open/closed, reason).
  // Never let a failed audit write undo/mask a change that already happened on NearCart.
  try {
    for (const item of result.items) {
      const previous = before.items.find((candidate) => candidate.shopId === item.shopId);
      await createAuditLog(prisma, {
        organizationId,
        actorUserId,
        action: AuditAction.UPDATE,
        entityType: "ShopTodayStatus",
        entityId: item.shopId,
        before: previous
          ? { todayStatus: previous.todayStatus, todayStatusReason: previous.todayStatusReason }
          : null,
        after: { todayStatus: item.todayStatus, todayStatusReason: item.todayStatusReason },
        meta: { shopName: item.name, branchId: scope.branchId ?? null, source: "NEARCART_MARKETPLACE" },
      });
    }
  } catch (error) {
    console.warn("[shop-status] Failed to write audit log for shop today-status change", error);
  }

  return { items: result.items };
}
