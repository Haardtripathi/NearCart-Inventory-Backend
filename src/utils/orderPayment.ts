/**
 * Money facts for a marketplace (NearCart) order, carried inside `SalesOrder.deliveryAddress`
 * under a `payment` key — see createBridgedSalesOrder in marketplace.service.ts.
 *
 * Why this lives in a Json column rather than real columns: `SalesOrder.subtotal/total` mean
 * "goods value" (stock/sales analytics depend on that), and the production DB is Turso/libSQL
 * where migrations are hand-applied, so the delivery fee / discount / payment method NearCart
 * charged the customer ride along in the existing `deliveryAddress` Json? column instead. Before
 * this existed the driver app told drivers to collect `total` (goods only, e.g. 360) when the
 * customer actually owed 434 including the delivery fee, and had no idea whether an order was
 * prepaid.
 *
 * Clients must NOT parse the Json blob themselves — both serializers (driver-orders +
 * sales-orders) expose the parsed `payment` object and the derived `amountToCollect` instead.
 */

export const ORDER_PAYMENT_METHODS = ["COD", "ONLINE", "PAY_ON_PICKUP"] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

// Mirrors NearCart's own `PaymentStatus` enum verbatim (NOT this repo's UNPAID/PARTIAL/PAID).
export const ORDER_PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"] as const;
export type OrderPaymentSourceStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export interface OrderPaymentInfo {
  method: OrderPaymentMethod | null;
  status: OrderPaymentSourceStatus | null;
  itemTotal: number | null;
  deliveryFee: number | null;
  weatherSurchargeFee: number | null;
  discountTotal: number | null;
  loyaltyDiscount: number | null;
  couponCode: string | null;
  amountPayable: number | null;
  currency: string | null;
}

function toAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  // Prisma.Decimal / numeric strings — tolerated so a hand-edited row can't break a serializer.
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  return null;
}

/**
 * Parses `deliveryAddress.payment` back out. Tolerant by design (returns null, never throws): a
 * money read must never be able to break an order list/detail response. Handles the raw-JSON-
 * *string* case too — see parseDeliveryAddressCoords in sales-orders.service.ts for the live
 * Prisma+libSQL bug where `Json?` columns came back un-deserialized.
 */
export function parseOrderPayment(deliveryAddress: unknown): OrderPaymentInfo | null {
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

  const raw = (value as Record<string, unknown>).payment;

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const method = ORDER_PAYMENT_METHODS.find((entry) => entry === record.method) ?? null;
  const status = ORDER_PAYMENT_STATUSES.find((entry) => entry === record.status) ?? null;

  return {
    method,
    status,
    itemTotal: toAmount(record.itemTotal),
    deliveryFee: toAmount(record.deliveryFee),
    weatherSurchargeFee: toAmount(record.weatherSurchargeFee),
    discountTotal: toAmount(record.discountTotal),
    loyaltyDiscount: toAmount(record.loyaltyDiscount),
    couponCode: typeof record.couponCode === "string" && record.couponCode.trim() ? record.couponCode.trim() : null,
    amountPayable: toAmount(record.amountPayable),
    currency: typeof record.currency === "string" && record.currency.trim() ? record.currency.trim() : null,
  };
}

/**
 * True only when NearCart says the customer has ALREADY paid online. Everything else (COD,
 * pay-at-shop, an ONLINE order whose payment is still PENDING/FAILED/REFUNDED, or an unknown
 * method/status) is deliberately NOT prepaid — wrongly telling a driver "nothing to collect"
 * loses real money, so the burden of proof is on "paid".
 */
export function isPrepaidOnline(payment: { method?: unknown; status?: unknown } | null | undefined): boolean {
  return payment?.method === "ONLINE" && payment?.status === "PAID";
}

/**
 * How much cash the DRIVER must collect at the customer's door.
 *
 *  - this order's own `paymentStatus` is PAID (staff marked it paid / prepaid at creation) -> 0
 *  - ONLINE + NearCart status PAID                                                         -> 0
 *  - PAY_ON_PICKUP (customer pays at the shop counter; the SHOP collects amountPayable)    -> 0
 *  - COD                                                                      -> amountPayable
 *  - ONLINE but NOT confirmed paid (PENDING/FAILED/REFUNDED/unknown) -> amountPayable. NearCart has
 *    no payment gateway today, so an "ONLINE" order has not actually moved any money; telling the
 *    driver "nothing to collect" would give the goods away for free.
 *  - no `payment` block at all (walk-in/phone orders, orders pushed by an older NearCart), or a
 *    block without a usable amountPayable/method -> the pre-existing behaviour: goods `total`.
 */
export function computeAmountToCollect(order: {
  total: unknown;
  paymentStatus: unknown;
  deliveryAddress?: unknown;
}): number {
  if (order.paymentStatus === "PAID") {
    return 0;
  }

  const total = toAmount(typeof order.total === "object" && order.total !== null ? String(order.total) : order.total) ?? 0;
  const payment = parseOrderPayment(order.deliveryAddress);

  if (!payment || !payment.method) {
    return total;
  }

  if (isPrepaidOnline(payment) || payment.method === "PAY_ON_PICKUP") {
    return 0;
  }

  return payment.amountPayable ?? total;
}

/**
 * The two explicit money fields every order serializer exposes (driver-orders + sales-orders), so
 * no client ever has to dig through the `deliveryAddress` Json blob.
 */
export function buildOrderPaymentView(order: { total: unknown; paymentStatus: unknown; deliveryAddress?: unknown }) {
  return {
    payment: parseOrderPayment(order.deliveryAddress),
    amountToCollect: computeAmountToCollect(order),
  };
}

export interface BridgedOrderPaymentInput {
  method?: OrderPaymentMethod;
  status?: OrderPaymentSourceStatus;
  itemTotal?: number;
  deliveryFee?: number;
  weatherSurchargeFee?: number;
  discountTotal?: number;
  loyaltyDiscount?: number;
  couponCode?: string;
  amountPayable?: number;
  currency?: string;
}

/**
 * Builds the value persisted into `SalesOrder.deliveryAddress` for a bridged order. The existing
 * `{ addressLine, latitude, longitude }` shape is kept byte-for-byte (parseDeliveryAddressCoords
 * and both driver clients read those three keys) — `payment` is purely additive, and only present
 * when the caller actually sent one, so orders from an older NearCart store exactly what they
 * always did (including `null` when there is neither an address nor a payment block).
 */
export function buildBridgedDeliveryAddress(
  customer: { addressLine?: string | null; latitude?: number | null; longitude?: number | null },
  payment?: BridgedOrderPaymentInput | null,
) {
  const hasAddress = Boolean(customer.addressLine) || customer.latitude != null || customer.longitude != null;
  const hasPayment = payment != null && Object.values(payment).some((entry) => entry !== undefined);

  if (!hasAddress && !hasPayment) {
    return null;
  }

  return {
    addressLine: customer.addressLine ?? null,
    latitude: customer.latitude ?? null,
    longitude: customer.longitude ?? null,
    ...(hasPayment ? { payment } : {}),
  };
}
