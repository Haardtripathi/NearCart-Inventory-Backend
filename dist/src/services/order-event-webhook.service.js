"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyOrderEvent = notifyOrderEvent;
const env_1 = require("../config/env");
/**
 * Reverse notification webhook caller — reports a bridged SalesOrder's status change back to
 * NearCart (which owns the customer/device-token relationship and sends the actual customer
 * push). Same shared secret as the inbound marketplace bridge (MARKETPLACE_INTERNAL_TOKEN ===
 * NearCart's INVENTORY_INTERNAL_TOKEN), sent the same way NearCart sends it to us
 * (x-internal-service-token). Fire-and-forget: a failed webhook call must never fail the
 * primary confirm/reject/assign/deliver action it's reporting on — log and move on, matching the
 * existing bridge's resilience posture.
 */
async function notifyOrderEvent(input) {
    if (!input.externalOrderId) {
        return;
    }
    if (!env_1.env.NEARCART_SERVICE_URL || !env_1.env.MARKETPLACE_INTERNAL_TOKEN) {
        console.warn(`[order-event-webhook] NearCart service URL/token not configured — skipping ${input.eventType} event for ${input.externalOrderId}.`);
        return;
    }
    try {
        const url = new URL("/api/internal/order-events", env_1.env.NEARCART_SERVICE_URL).toString();
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-internal-service-token": env_1.env.MARKETPLACE_INTERNAL_TOKEN,
            },
            body: JSON.stringify(input),
        });
        if (!response.ok) {
            console.warn(`[order-event-webhook] NearCart returned ${response.status} for ${input.eventType} event on ${input.externalOrderId}`);
        }
    }
    catch (error) {
        console.warn(`[order-event-webhook] Failed to notify NearCart of ${input.eventType} event`, error);
    }
}
