import { env } from "../config/env";
import type { PartialFulfilmentInfo } from "../utils/partialFulfilment";

type OrderEventType =
  | "CONFIRMED"
  | "REJECTED"
  | "READY"
  | "DRIVER_ASSIGNED"
  | "DRIVER_UNASSIGNED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "AUTO_CANCELLED"
  | "CANCELLED"
  // Shop-side partial fulfilment (see utils/partialFulfilment.ts). Added as explicit event types
  // rather than folded into the status-based ones above because PARTIAL_PROPOSED carries NO
  // status change at all (the order deliberately stays PENDING while the customer decides), and
  // because the customer-facing copy for "you declined the revised order" is nothing like the
  // generic "the shop rejected your order". Every existing event above is untouched.
  | "PARTIAL_PROPOSED"
  | "PARTIAL_ACCEPTED"
  | "PARTIAL_DECLINED"
  | "PARTIAL_EXPIRED";

interface NotifyOrderEventInput {
  externalOrderId: string;
  status: string;
  eventType: OrderEventType;
  assignedDriver?: { fullName: string; phone: string; vehicleType: string } | null;
  // Delivery-proof photo URL captured by the driver app right before calling
  // POST /driver/orders/:id/deliver (see driver-orders.service.ts's deliverDriverOrder /
  // SalesOrder.deliveryProofPhotoUrl) — only meaningful on a DELIVERED event, and only present
  // when the driver actually attached a photo (optional on that call). Added 2026-08-07 so
  // NearCart's customer-facing delivery confirmation can show the same proof photo the shop staff
  // see, matching the existing pattern of carrying synced fields like driver name/phone on this
  // same webhook.
  deliveryProofPhotoUrl?: string | null;
  // The full partial-fulfilment proposal, sent on every PARTIAL_* event so NearCart can render
  // the review screen (and word its customer push) without an extra bridge round trip. Absent on
  // every other event type.
  partialFulfilment?: PartialFulfilmentInfo | null;
}

/**
 * Reverse notification webhook caller — reports a bridged SalesOrder's status change back to
 * NearCart (which owns the customer/device-token relationship and sends the actual customer
 * push). Same shared secret as the inbound marketplace bridge (MARKETPLACE_INTERNAL_TOKEN ===
 * NearCart's INVENTORY_INTERNAL_TOKEN), sent the same way NearCart sends it to us
 * (x-internal-service-token). Fire-and-forget: a failed webhook call must never fail the
 * primary confirm/reject/assign/deliver action it's reporting on — log and move on, matching the
 * existing bridge's resilience posture.
 */
async function notifyOrderEvent(input: NotifyOrderEventInput): Promise<void> {
  if (!input.externalOrderId) {
    return;
  }

  if (!env.NEARCART_SERVICE_URL || !env.MARKETPLACE_INTERNAL_TOKEN) {
    console.warn(
      `[order-event-webhook] NearCart service URL/token not configured — skipping ${input.eventType} event for ${input.externalOrderId}.`,
    );
    return;
  }

  try {
    const url = new URL("/api/internal/order-events", env.NEARCART_SERVICE_URL).toString();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-service-token": env.MARKETPLACE_INTERNAL_TOKEN,
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      console.warn(
        `[order-event-webhook] NearCart returned ${response.status} for ${input.eventType} event on ${input.externalOrderId}`,
      );
    }
  } catch (error) {
    console.warn(`[order-event-webhook] Failed to notify NearCart of ${input.eventType} event`, error);
  }
}

export { notifyOrderEvent };
export type { OrderEventType };
