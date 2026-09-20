/**
 * Shop-side PARTIAL FULFILMENT with customer approval.
 *
 * The shop opens an order it can only partly supply ("I have 3 of the 5 things you ordered"),
 * proposes a reduced order, and the customer approves or refuses it in the NearCart app. While
 * that is in flight the order deliberately STAYS `PENDING`:
 *
 *  - nothing has been committed yet — no stock has moved, no SalesOrderItem row has been touched,
 *    and the shop may still reject/cancel normally;
 *  - `SalesOrderStatus` therefore needs no new value, which in turn means no migration. That
 *    matters here specifically: the production DB is Turso/libSQL, where `prisma migrate`/
 *    `db push` do not work against a `libsql://` URL and DDL has to be hand-applied (a documented,
 *    repeatedly-bitten hazard in this repo).
 *
 * The proposal itself rides inside the existing nullable `SalesOrder.deliveryAddress` Json column
 * under a `partialFulfilment` key — exactly the precedent already set by the `payment` block
 * there (see utils/orderPayment.ts for the full rationale of why money/negotiation facts live in
 * that Json column rather than getting real columns of their own).
 *
 * Everything below is deliberately tolerant (returns null, never throws) and handles the raw
 * JSON *string* case: `Json?` columns have been observed coming back un-deserialized through this
 * repo's Prisma + libSQL/Turso adapter (see parseDeliveryAddressCoords / parseDeclinedDriverIds
 * in sales-orders.service.ts for the two live bugs that caused). A read of the proposal must
 * never be able to break an order list/detail response.
 *
 * Clients must NOT parse the Json blob themselves — the sales-order serializers, the driver
 * serializer's siblings and the marketplace read-back endpoint all expose the parsed
 * `partialFulfilment` object instead.
 */

export const PARTIAL_FULFILMENT_STATES = ["AWAITING_CUSTOMER", "ACCEPTED", "DECLINED", "EXPIRED"] as const;
export type PartialFulfilmentState = (typeof PARTIAL_FULFILMENT_STATES)[number];

/**
 * An item the shop cannot supply at all (proposed `availableQuantity: 0`). `productId`/`variantId`
 * are the Inventory catalog ids and are what NearCart matches its own `OrderItem` rows against
 * (`OrderItem.inventoryProductId`/`inventoryVariantId`) — `itemId` is this repo's
 * `SalesOrderItem.id`, which NearCart has no copy of.
 */
export interface PartialFulfilmentRemovedItem {
  itemId: string;
  productId: string | null;
  variantId: string | null;
  name: string;
  variantName: string | null;
  quantity: number;
  lineTotal: number;
  reason: string | null;
}

/** An item the shop can supply, but in a smaller quantity than ordered. */
export interface PartialFulfilmentReducedItem {
  itemId: string;
  productId: string | null;
  variantId: string | null;
  name: string;
  variantName: string | null;
  fromQuantity: number;
  toQuantity: number;
  lineTotal: number;
}

export interface PartialFulfilmentInfo {
  state: PartialFulfilmentState;
  proposedAt: string;
  respondedAt: string | null;
  expiresAt: string;
  note: string | null;
  removedItems: PartialFulfilmentRemovedItem[];
  reducedItems: PartialFulfilmentReducedItem[];
  /** Goods value (`SalesOrder.total`) before the proposal. */
  originalTotal: number;
  /** Goods value if the customer accepts. */
  proposedTotal: number;
  /**
   * What the customer would owe if they accept — item total change only; the delivery fee is
   * deliberately unchanged (a driver still makes the same ride). `null` for an order with no
   * `payment` block at all (walk-in/phone orders, or a push from an older NearCart).
   */
  proposedAmountPayable: number | null;
}

function toAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Parses `SalesOrder.deliveryAddress` into a plain object, tolerating both the raw-JSON-string
 * case and a null/malformed value. Shared by every reader/writer below so the string quirk is
 * handled in exactly one place.
 */
export function parseDeliveryAddressObject(deliveryAddress: unknown): Record<string, unknown> | null {
  let value = deliveryAddress;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseRemovedItems(value: unknown): PartialFulfilmentRemovedItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const itemId = toText(record.itemId);

    if (!itemId) {
      return [];
    }

    return [
      {
        itemId,
        productId: toText(record.productId),
        variantId: toText(record.variantId),
        name: toText(record.name) ?? "Item",
        variantName: toText(record.variantName),
        quantity: toAmount(record.quantity) ?? 0,
        lineTotal: toAmount(record.lineTotal) ?? 0,
        reason: toText(record.reason),
      },
    ];
  });
}

function parseReducedItems(value: unknown): PartialFulfilmentReducedItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const itemId = toText(record.itemId);

    if (!itemId) {
      return [];
    }

    return [
      {
        itemId,
        productId: toText(record.productId),
        variantId: toText(record.variantId),
        name: toText(record.name) ?? "Item",
        variantName: toText(record.variantName),
        fromQuantity: toAmount(record.fromQuantity) ?? 0,
        toQuantity: toAmount(record.toQuantity) ?? 0,
        lineTotal: toAmount(record.lineTotal) ?? 0,
      },
    ];
  });
}

/**
 * Reads `deliveryAddress.partialFulfilment` back out. Returns null (never throws) when there is
 * no proposal, or when the stored value is unrecognizable — same posture as parseOrderPayment.
 */
export function parsePartialFulfilment(deliveryAddress: unknown): PartialFulfilmentInfo | null {
  const address = parseDeliveryAddressObject(deliveryAddress);

  if (!address) {
    return null;
  }

  const raw = address.partialFulfilment;

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const state = PARTIAL_FULFILMENT_STATES.find((entry) => entry === record.state);

  if (!state) {
    return null;
  }

  const proposedAt = toText(record.proposedAt);
  const expiresAt = toText(record.expiresAt);

  if (!proposedAt || !expiresAt) {
    return null;
  }

  return {
    state,
    proposedAt,
    respondedAt: toText(record.respondedAt),
    expiresAt,
    note: toText(record.note),
    removedItems: parseRemovedItems(record.removedItems),
    reducedItems: parseReducedItems(record.reducedItems),
    originalTotal: toAmount(record.originalTotal) ?? 0,
    proposedTotal: toAmount(record.proposedTotal) ?? 0,
    proposedAmountPayable: toAmount(record.proposedAmountPayable),
  };
}

/** True only while the shop is actually waiting on the customer. */
export function isAwaitingCustomer(deliveryAddress: unknown): boolean {
  return parsePartialFulfilment(deliveryAddress)?.state === "AWAITING_CUSTOMER";
}

/**
 * The single explicit field every sales-order serializer exposes, so no client ever has to dig
 * through the `deliveryAddress` Json blob (mirrors buildOrderPaymentView in utils/orderPayment.ts).
 */
export function buildPartialFulfilmentView(order: { deliveryAddress?: unknown }) {
  return { partialFulfilment: parsePartialFulfilment(order.deliveryAddress) };
}

/**
 * Returns the value to persist back into `SalesOrder.deliveryAddress` with `partialFulfilment`
 * set/replaced. Every other key (`addressLine`/`latitude`/`longitude`, and the `payment` block)
 * is carried over byte-for-byte — both driver clients and parseDeliveryAddressCoords read those.
 */
export function withPartialFulfilment(
  deliveryAddress: unknown,
  partialFulfilment: PartialFulfilmentInfo,
): Record<string, unknown> {
  return {
    ...(parseDeliveryAddressObject(deliveryAddress) ?? {}),
    partialFulfilment,
  };
}

/**
 * Same, for the `payment` block — used when an accepted proposal changes what the customer owes,
 * so the driver collects the revised amount rather than the original one.
 */
export function withPaymentBlock(
  deliveryAddress: unknown,
  payment: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(parseDeliveryAddressObject(deliveryAddress) ?? {}),
    payment,
  };
}
