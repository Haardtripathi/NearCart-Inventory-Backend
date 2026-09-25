"use strict";
/**
 * Shop-side PARTIAL FULFILMENT with customer approval.
 *
 * The shop opens an order it can only partly supply ("I have 3 of the 5 things you ordered"),
 * proposes a reduced order, and the customer approves or refuses it in the NearCart app.
 *
 * THE CUSTOMER'S YES IS NOT THE END OF THE NEGOTIATION. The states run
 * `AWAITING_CUSTOMER -> CUSTOMER_ACCEPTED -> ACCEPTED`: the customer approving the revised order
 * hands it BACK to the shop, which still has to confirm it the normal way before anything is
 * committed. That second approval is not ceremony — minutes can pass while the customer decides,
 * and a walk-in can buy the very stock the proposal promised, so the shop has to be the one who
 * says "yes, I can still supply this" at the moment stock actually moves. `ACCEPTED` therefore
 * means "shop confirmed the revised order", and is written by `confirmSalesOrder`, not by the
 * customer's response.
 *
 * While any of that is in flight the order deliberately STAYS `PENDING`:
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PARTIAL_FULFILMENT_STATES = void 0;
exports.parseDeliveryAddressObject = parseDeliveryAddressObject;
exports.parsePartialFulfilment = parsePartialFulfilment;
exports.isAwaitingCustomer = isAwaitingCustomer;
exports.isAwaitingShopConfirmation = isAwaitingShopConfirmation;
exports.buildPartialFulfilmentView = buildPartialFulfilmentView;
exports.withPartialFulfilment = withPartialFulfilment;
exports.withPaymentBlock = withPaymentBlock;
exports.PARTIAL_FULFILMENT_STATES = [
    "AWAITING_CUSTOMER",
    "CUSTOMER_ACCEPTED",
    "ACCEPTED",
    "DECLINED",
    "EXPIRED",
];
function parseRevisedPayment(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return null;
    }
    const record = value;
    const discountTotal = toAmount(record.discountTotal);
    const loyaltyDiscount = toAmount(record.loyaltyDiscount);
    const amountPayable = toAmount(record.amountPayable);
    return {
        ...(discountTotal != null ? { discountTotal } : {}),
        ...(loyaltyDiscount != null ? { loyaltyDiscount } : {}),
        ...(amountPayable != null ? { amountPayable } : {}),
        // `null` is meaningful here (it means "the coupon no longer applies, drop it"), so it is kept
        // as-is rather than collapsed away like the numeric fields above.
        ...("couponCode" in record ? { couponCode: toText(record.couponCode) } : {}),
    };
}
function toAmount(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function toText(value) {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
/**
 * Parses `SalesOrder.deliveryAddress` into a plain object, tolerating both the raw-JSON-string
 * case and a null/malformed value. Shared by every reader/writer below so the string quirk is
 * handled in exactly one place.
 */
function parseDeliveryAddressObject(deliveryAddress) {
    let value = deliveryAddress;
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        }
        catch {
            return null;
        }
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return null;
    }
    return value;
}
function parseRemovedItems(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) {
            return [];
        }
        const record = entry;
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
function parseReducedItems(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) {
            return [];
        }
        const record = entry;
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
function parsePartialFulfilment(deliveryAddress) {
    const address = parseDeliveryAddressObject(deliveryAddress);
    if (!address) {
        return null;
    }
    const raw = address.partialFulfilment;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return null;
    }
    const record = raw;
    const state = exports.PARTIAL_FULFILMENT_STATES.find((entry) => entry === record.state);
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
        customerPayment: parseRevisedPayment(record.customerPayment),
    };
}
/** True only while the shop is actually waiting on the customer. */
function isAwaitingCustomer(deliveryAddress) {
    return parsePartialFulfilment(deliveryAddress)?.state === "AWAITING_CUSTOMER";
}
/** True once the customer has approved a revised order that the shop has not yet confirmed. */
function isAwaitingShopConfirmation(deliveryAddress) {
    return parsePartialFulfilment(deliveryAddress)?.state === "CUSTOMER_ACCEPTED";
}
/**
 * The single explicit field every sales-order serializer exposes, so no client ever has to dig
 * through the `deliveryAddress` Json blob (mirrors buildOrderPaymentView in utils/orderPayment.ts).
 */
function buildPartialFulfilmentView(order) {
    return { partialFulfilment: parsePartialFulfilment(order.deliveryAddress) };
}
/**
 * Returns the value to persist back into `SalesOrder.deliveryAddress` with `partialFulfilment`
 * set/replaced. Every other key (`addressLine`/`latitude`/`longitude`, and the `payment` block)
 * is carried over byte-for-byte — both driver clients and parseDeliveryAddressCoords read those.
 */
function withPartialFulfilment(deliveryAddress, partialFulfilment) {
    return {
        ...(parseDeliveryAddressObject(deliveryAddress) ?? {}),
        partialFulfilment,
    };
}
/**
 * Same, for the `payment` block — used when an accepted proposal changes what the customer owes,
 * so the driver collects the revised amount rather than the original one.
 */
function withPaymentBlock(deliveryAddress, payment) {
    return {
        ...(parseDeliveryAddressObject(deliveryAddress) ?? {}),
        payment,
    };
}
