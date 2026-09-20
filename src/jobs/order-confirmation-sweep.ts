import { schedule } from "node-cron";
import { SalesOrderStatus } from "@prisma/client";

import { prisma } from "../config/prisma";
import { expirePartialFulfilment, rejectSalesOrder } from "../modules/sales-orders/sales-orders.service";
import { parsePartialFulfilment } from "../utils/partialFulfilment";

const AUTO_CANCEL_REASON = "Shop did not confirm in time (auto-cancelled)";

/**
 * Finds every PENDING SalesOrder whose confirmationDeadlineAt has passed and auto-rejects it,
 * routing through the existing staff-facing rejectSalesOrder (actorUserId: null — same nullable-
 * actor pattern already used for the nearest-free-driver auto-assign path in
 * sales-orders.service.ts) so the exact same audit-log write, stock-untouched invariant (nothing
 * was ever deducted for a PENDING order), and reverse-webhook notification (Phase A.3 ->
 * eventType "REJECTED") all fire identically to a staff-initiated reject — the customer is
 * notified immediately either way, per the confirmed product decision that auto-cancels notify
 * the customer.
 *
 * PARTIAL FULFILMENT (see utils/partialFulfilment.ts): an order the shop has asked the customer
 * to approve a REDUCED version of deliberately stays PENDING while the customer decides, which
 * means it lands squarely in this sweep's query. Auto-rejecting it here would silently kill a
 * live order the shop is actively negotiating — so a proposal still inside its own `expiresAt`
 * window is skipped outright, and one that has run out is routed to `expirePartialFulfilment`
 * (cancel, reason "Customer did not respond…", shop notified) instead of the shop-didn't-confirm
 * auto-reject, which would blame the wrong party. Proposing also pushes the order's
 * `confirmationDeadlineAt` out to the proposal's `expiresAt`, so in practice this sweep only sees
 * such an order at exactly the moment it should act on it; the state check below is belt-and-
 * braces for rows where that write and this read disagree.
 *
 * Exported as a plain function (not just the cron registration) so it can be invoked directly in
 * tests/manual verification without waiting for the schedule to tick.
 */
export async function sweepExpiredPendingOrders(): Promise<{ processed: number; failed: number }> {
  let overdue: Array<{ id: string; organizationId: string; deliveryAddress: unknown }>;

  try {
    // Bug fixed 2026-07-27 (found via live end-to-end test): this query previously ran
    // unguarded. A transient DB error here (e.g. connection-pool exhaustion) rejected the
    // promise returned by this function; since registerOrderConfirmationSweep's cron callback
    // fires it as `void sweepExpiredPendingOrders()`, that rejection was unhandled — Node treats
    // an unhandled promise rejection as fatal by default, which crashed the entire backend
    // process on the next scheduled tick. Every DB call in this file must be inside a try/catch
    // for exactly this reason: this function runs unattended, once a minute, forever.
    overdue = await prisma.salesOrder.findMany({
      where: {
        status: SalesOrderStatus.PENDING,
        confirmationDeadlineAt: { lt: new Date() },
      },
      select: { id: true, organizationId: true, deliveryAddress: true },
    });
  } catch (error) {
    console.warn("[order-confirmation-sweep] Failed to query overdue orders — skipping this tick", error);
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  const now = Date.now();

  for (const order of overdue) {
    try {
      const proposal = parsePartialFulfilment(order.deliveryAddress);

      if (proposal?.state === "AWAITING_CUSTOMER") {
        const expiresAt = Date.parse(proposal.expiresAt);

        // Still inside the customer's window — leave it alone. This is the check that stops the
        // sweep from killing orders mid-negotiation.
        if (Number.isFinite(expiresAt) && expiresAt > now) {
          continue;
        }

        await expirePartialFulfilment(order.organizationId, order.id);
        processed += 1;
        continue;
      }

      await rejectSalesOrder(order.organizationId, order.id, null, AUTO_CANCEL_REASON);
      processed += 1;
    } catch (error) {
      // One bad row (e.g. a concurrent staff confirm/reject racing this same order) must never
      // stop the sweep from processing the rest of the batch.
      failed += 1;
      console.warn(`[order-confirmation-sweep] Failed to auto-cancel order ${order.id}`, error);
    }
  }

  if (processed > 0 || failed > 0) {
    console.log(
      `[order-confirmation-sweep] Processed ${processed} auto-cancellation(s), ${failed} failure(s).`,
    );
  }

  return { processed, failed };
}

/** Registers the every-minute sweep. Called once at server startup (see server.ts). */
export function registerOrderConfirmationSweep(): void {
  schedule("* * * * *", () => {
    // Defense in depth on top of the internal try/catch above — a scheduled job must never be
    // able to produce an unhandled rejection that takes the whole process down with it.
    sweepExpiredPendingOrders().catch((error) => {
      console.warn("[order-confirmation-sweep] Unexpected error during sweep tick", error);
    });
  });

  console.log("[order-confirmation-sweep] Registered (runs every minute).");
}
