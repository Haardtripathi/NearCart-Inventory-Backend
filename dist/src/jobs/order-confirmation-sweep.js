"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sweepExpiredPendingOrders = sweepExpiredPendingOrders;
exports.registerOrderConfirmationSweep = registerOrderConfirmationSweep;
const node_cron_1 = require("node-cron");
const client_1 = require("@prisma/client");
const prisma_1 = require("../config/prisma");
const sales_orders_service_1 = require("../modules/sales-orders/sales-orders.service");
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
 * Exported as a plain function (not just the cron registration) so it can be invoked directly in
 * tests/manual verification without waiting for the schedule to tick.
 */
async function sweepExpiredPendingOrders() {
    let overdue;
    try {
        // Bug fixed 2026-07-27 (found via live end-to-end test): this query previously ran
        // unguarded. A transient DB error here (e.g. connection-pool exhaustion) rejected the
        // promise returned by this function; since registerOrderConfirmationSweep's cron callback
        // fires it as `void sweepExpiredPendingOrders()`, that rejection was unhandled — Node treats
        // an unhandled promise rejection as fatal by default, which crashed the entire backend
        // process on the next scheduled tick. Every DB call in this file must be inside a try/catch
        // for exactly this reason: this function runs unattended, once a minute, forever.
        overdue = await prisma_1.prisma.salesOrder.findMany({
            where: {
                status: client_1.SalesOrderStatus.PENDING,
                confirmationDeadlineAt: { lt: new Date() },
            },
            select: { id: true, organizationId: true },
        });
    }
    catch (error) {
        console.warn("[order-confirmation-sweep] Failed to query overdue orders — skipping this tick", error);
        return { processed: 0, failed: 0 };
    }
    let processed = 0;
    let failed = 0;
    for (const order of overdue) {
        try {
            await (0, sales_orders_service_1.rejectSalesOrder)(order.organizationId, order.id, null, AUTO_CANCEL_REASON);
            processed += 1;
        }
        catch (error) {
            // One bad row (e.g. a concurrent staff confirm/reject racing this same order) must never
            // stop the sweep from processing the rest of the batch.
            failed += 1;
            console.warn(`[order-confirmation-sweep] Failed to auto-cancel order ${order.id}`, error);
        }
    }
    if (processed > 0 || failed > 0) {
        console.log(`[order-confirmation-sweep] Processed ${processed} auto-cancellation(s), ${failed} failure(s).`);
    }
    return { processed, failed };
}
/** Registers the every-minute sweep. Called once at server startup (see server.ts). */
function registerOrderConfirmationSweep() {
    (0, node_cron_1.schedule)("* * * * *", () => {
        // Defense in depth on top of the internal try/catch above — a scheduled job must never be
        // able to produce an unhandled rejection that takes the whole process down with it.
        sweepExpiredPendingOrders().catch((error) => {
            console.warn("[order-confirmation-sweep] Unexpected error during sweep tick", error);
        });
    });
    console.log("[order-confirmation-sweep] Registered (runs every minute).");
}
