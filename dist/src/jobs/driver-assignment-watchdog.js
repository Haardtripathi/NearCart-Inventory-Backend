"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDriverAssignmentWatchdog = registerDriverAssignmentWatchdog;
const node_cron_1 = require("node-cron");
const driver_orders_service_1 = require("../modules/driver-orders/driver-orders.service");
/**
 * Registers the driver-assignment watchdog — see `sweepStaleDriverAssignments`'s doc comment in
 * driver-orders.service.ts for the full rationale (a non-responsive driver could otherwise hold a
 * READY order forever with no reassignment) — and, on the same tick, the near-timeout reminder
 * push (`sendNearTimeoutReminders`, NEW FEATURE: nudges a driver roughly halfway through the
 * staleness window before they lose the order to reassignment). Runs every 2 minutes: frequent
 * enough that a stale assignment (default threshold `DRIVER_ASSIGNMENT_STALE_MINUTES`, 10 minutes)
 * is caught promptly, without being so tight that it fights a driver who is genuinely just about
 * to act. `sendNearTimeoutReminders`'s own reminder window is deliberately sized against this
 * exact 2-minute cadence — keep them in sync if this schedule ever changes.
 */
// node-cron fires on the wall clock whether or not the previous tick has finished, so a slow run
// would otherwise have a second one select and race the same orders — unassigning or re-notifying
// twice. Tracked per sweep so a slow one never blocks the other (they are deliberately independent,
// see below).
let staleSweepInFlight = false;
let reminderSweepInFlight = false;
function registerDriverAssignmentWatchdog() {
    (0, node_cron_1.schedule)("*/2 * * * *", () => {
        // Defense in depth on top of each function's own internal try/catch blocks — a scheduled job
        // must never be able to produce an unhandled rejection that takes the whole process down with
        // it (this exact bug class was previously found and fixed in this same backend's
        // order-confirmation-sweep). Run independently (not chained) so a failure in one never
        // prevents the other from running.
        if (staleSweepInFlight) {
            console.warn("[driver-assignment-watchdog] Previous stale-assignment sweep still running — skipping.");
        }
        else {
            staleSweepInFlight = true;
            (0, driver_orders_service_1.sweepStaleDriverAssignments)()
                .catch((error) => {
                console.warn("[driver-assignment-watchdog] Unexpected error during sweep tick", error);
            })
                .finally(() => {
                staleSweepInFlight = false;
            });
        }
        if (reminderSweepInFlight) {
            console.warn("[driver-assignment-watchdog] Previous reminder sweep still running — skipping.");
        }
        else {
            reminderSweepInFlight = true;
            (0, driver_orders_service_1.sendNearTimeoutReminders)()
                .catch((error) => {
                console.warn("[driver-assignment-watchdog] Unexpected error during reminder tick", error);
            })
                .finally(() => {
                reminderSweepInFlight = false;
            });
        }
    });
    console.log("[driver-assignment-watchdog] Registered (runs every 2 minutes).");
}
