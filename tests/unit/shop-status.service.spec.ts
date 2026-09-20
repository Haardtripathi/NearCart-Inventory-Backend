// Service-level tests for the shop "open today" proxy (src/modules/shop-status) — NearCart itself
// is stubbed at the `fetch` boundary, so this covers exactly what this backend owns: the outbound
// request shape (URL, shared-secret header, body), branch-access enforcement, and the mapping of
// NearCart failures onto the friendly errors the Partner app shows. No DB, no login: prisma/env/
// audit are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/env", () => ({
  env: { NEARCART_SERVICE_URL: "http://nearcart.test", MARKETPLACE_INTERNAL_TOKEN: "test-internal-token" },
}));
vi.mock("../../src/config/prisma", () => ({ prisma: {} }));
const createAuditLog = vi.fn(async () => ({}));
vi.mock("../../src/modules/audit/audit.service", () => ({ createAuditLog: (...args: unknown[]) => createAuditLog(...(args as [])) }));

import { getShopStatus, updateShopStatus } from "../../src/modules/shop-status/shop-status.service";

function item(overrides: Record<string, unknown> = {}) {
  return {
    shopId: "shop-1",
    name: "Test Shop",
    slug: "test-shop",
    inventoryBranchId: "branch-a",
    todayStatus: "PENDING_CONFIRMATION",
    isOpenToday: null,
    todayStatusReason: null,
    todayStatusUpdatedAt: null,
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  createAuditLog.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shop-status proxy", () => {
  it("GET forwards org + branch with the shared-secret header and returns NearCart's items", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [item()] }));

    const result = await getShopStatus("org-1", { scope: "ALL", branchIds: [] }, "branch-a");

    expect(result.items).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://nearcart.test/api/internal/shops/today-status?organizationId=org-1&branchId=branch-a");
    expect(init.method).toBe("GET");
    expect(init.headers["x-internal-service-token"]).toBe("test-internal-token");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("GET maps an empty list to 404 'not listed'", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [] }));

    await expect(getShopStatus("org-1", undefined)).rejects.toMatchObject({
      statusCode: 404,
      message: "This shop isn't listed on NearCart yet.",
    });
  });

  it("maps a network failure / timeout to 503", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(getShopStatus("org-1", undefined)).rejects.toMatchObject({
      statusCode: 503,
      message: "Couldn't reach the NearCart marketplace. Try again.",
    });
  });

  it("maps a NearCart 5xx/403 — and a bare unknown-route 404 from an older NearCart build — to 503, not 'not listed'", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { message: "boom" }));
    await expect(getShopStatus("org-1", undefined)).rejects.toMatchObject({ statusCode: 503 });

    fetchMock.mockResolvedValueOnce(jsonResponse(403, { message: "Invalid internal service token" }));
    await expect(getShopStatus("org-1", undefined)).rejects.toMatchObject({ statusCode: 503 });

    fetchMock.mockResolvedValueOnce(jsonResponse(404, { message: "Route not found" }));
    await expect(getShopStatus("org-1", undefined)).rejects.toMatchObject({ statusCode: 503 });
  });

  it("enforces branch access: 403 for a branch outside a SELECTED-scope member's allowlist, before any NearCart call", async () => {
    await expect(
      getShopStatus("org-1", { scope: "SELECTED", branchIds: ["branch-a"] }, "branch-b"),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      updateShopStatus("org-1", "user-1", { scope: "SELECTED", branchIds: ["branch-a"] }, { branchId: "branch-b", isOpen: true }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("narrows a single-branch SELECTED member to their branch; filters a multi-branch member's GET and makes their PATCH name a branch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [item()] }));
    await getShopStatus("org-1", { scope: "SELECTED", branchIds: ["branch-a"] });
    expect(fetchMock.mock.calls[0]![0]).toContain("branchId=branch-a");

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        items: [
          item({ shopId: "s-a", inventoryBranchId: "branch-a" }),
          item({ shopId: "s-c", inventoryBranchId: "branch-c" }),
          item({ shopId: "s-org", inventoryBranchId: null }),
        ],
      }),
    );
    const filtered = await getShopStatus("org-1", { scope: "SELECTED", branchIds: ["branch-a", "branch-b"] });
    expect(filtered.items.map((entry) => entry.shopId)).toEqual(["s-a", "s-org"]);

    const callsBefore = fetchMock.mock.calls.length;
    await expect(
      updateShopStatus("org-1", "user-1", { scope: "SELECTED", branchIds: ["branch-a", "branch-b"] }, { isOpen: true }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("PATCH sends the right body (reason only when closing), returns NearCart's items and writes an audit log", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { items: [item({ todayStatus: "OPEN", isOpenToday: true })] }))
      .mockResolvedValueOnce(
        jsonResponse(200, { items: [item({ todayStatus: "CLOSED", isOpenToday: false, todayStatusReason: "Holiday" })] }),
      );

    const result = await updateShopStatus("org-1", "user-1", undefined, { branchId: "branch-a", isOpen: false, reason: " Holiday " });

    expect(result.items[0]).toMatchObject({ todayStatus: "CLOSED", todayStatusReason: "Holiday" });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("http://nearcart.test/api/internal/shops/today-status");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ organizationId: "org-1", branchId: "branch-a", isOpen: false, reason: "Holiday" });

    expect(createAuditLog).toHaveBeenCalledTimes(1);
    expect(createAuditLog.mock.calls[0]![1]).toMatchObject({
      organizationId: "org-1",
      actorUserId: "user-1",
      action: "UPDATE",
      entityType: "ShopTodayStatus",
      entityId: "shop-1",
      before: { todayStatus: "OPEN" },
      after: { todayStatus: "CLOSED", todayStatusReason: "Holiday" },
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { items: [item()] }))
      .mockResolvedValueOnce(jsonResponse(200, { items: [item({ todayStatus: "OPEN", isOpenToday: true })] }));
    await updateShopStatus("org-1", "user-1", undefined, { isOpen: true, reason: "stale reason" });
    expect(JSON.parse(fetchMock.mock.calls[3]![1].body)).toEqual({ organizationId: "org-1", isOpen: true });
  });

  it("PATCH maps NearCart's SHOP_NOT_LINKED 404 to 'not listed', and a failed audit write never fails the change", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { items: [item()] }))
      .mockResolvedValueOnce(jsonResponse(404, { message: "No NearCart shop is linked", details: { code: "SHOP_NOT_LINKED" } }));
    await expect(updateShopStatus("org-1", "user-1", undefined, { isOpen: true })).rejects.toMatchObject({
      statusCode: 404,
      message: "This shop isn't listed on NearCart yet.",
    });

    createAuditLog.mockRejectedValueOnce(new Error("db down"));
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { items: [item()] }))
      .mockResolvedValueOnce(jsonResponse(200, { items: [item({ todayStatus: "OPEN", isOpenToday: true })] }));
    const result = await updateShopStatus("org-1", "user-1", undefined, { isOpen: true });
    expect(result.items[0]!.todayStatus).toBe("OPEN");
  });
});
