"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushToDriver = sendPushToDriver;
exports.sendPushToOrgStaff = sendPushToOrgStaff;
exports.sendPushToTokens = sendPushToTokens;
const prisma_1 = require("../config/prisma");
const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";
// Expo's documented max messages per request — see
// https://docs.expo.dev/push-notifications/sending-notifications/#push-tickets-request
const EXPO_PUSH_BATCH_SIZE = 100;
function chunk(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}
/**
 * Sends via Expo's push API (https://exp.host/--/api/v2/push/send), not Firebase Admin directly.
 *
 * Fixed 2026-07-27: this previously called `admin.messaging().sendEachForMulticast()` with the
 * tokens stored in `DeviceToken.expoPushToken` — but those are Expo push tokens
 * (`ExponentPushToken[...]`), a format only Expo's own push relay understands. Firebase Admin
 * expects raw FCM/APNs device registration tokens, which are a different value obtained via
 * `Notifications.getDevicePushTokenAsync()`, not `getExpoPushTokenAsync()`. Sending an Expo token
 * to Firebase Admin would silently fail (invalid-registration-token) for every single push. Since
 * every mobile client in this family is Expo-managed, using Expo's push API directly is simpler
 * and correct: no native FCM/APNs wiring needed client-side, no Firebase Admin credentials needed
 * for this feature at all.
 *
 * No-ops with a logged warning (not a thrown error) when there are no tokens to send to. Network/
 * API failures are caught here (same resilience posture as before) so a best-effort push never
 * turns into an unhandled rejection — every caller invokes this fire-and-forget (`void sendPush...`).
 */
async function sendPushToTokens(input) {
    if (input.tokens.length === 0) {
        return;
    }
    const validTokens = input.tokens.filter((token) => token.startsWith("ExponentPushToken["));
    if (validTokens.length === 0) {
        console.warn(`[push-notification] No valid Expo push tokens among ${input.tokens.length} token(s) for "${input.title}" — skipping.`);
        return;
    }
    try {
        const staleTokens = [];
        for (const batch of chunk(validTokens, EXPO_PUSH_BATCH_SIZE)) {
            const messages = batch.map((token) => ({
                to: token,
                title: input.title,
                body: input.body,
                data: input.data,
                sound: "default",
                channelId: input.channelId ?? "default",
                priority: "high",
            }));
            const response = await fetch(EXPO_PUSH_API_URL, {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(messages),
                signal: AbortSignal.timeout(10_000),
            });
            const payload = (await response.json().catch(() => null));
            if (!response.ok || !payload?.data) {
                console.warn(`[push-notification] Expo push API request failed with status ${response.status}`);
                continue;
            }
            payload.data.forEach((ticket, index) => {
                const token = batch[index];
                if (token && ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
                    staleTokens.push(token);
                }
            });
        }
        if (staleTokens.length > 0) {
            await prisma_1.prisma.deviceToken.deleteMany({ where: { expoPushToken: { in: staleTokens } } });
        }
    }
    catch (error) {
        console.warn(`[push-notification] Failed to send push "${input.title}" — continuing without it`, error);
    }
}
/** Sends to every device token registered for every User with an active membership on this org. */
async function sendPushToOrgStaff(organizationId, payload) {
    const memberships = await prisma_1.prisma.organizationMembership.findMany({
        where: { organizationId, status: "ACTIVE" },
        select: { userId: true },
    });
    if (memberships.length === 0) {
        return;
    }
    const deviceTokens = await prisma_1.prisma.deviceToken.findMany({
        where: { ownerType: "USER", ownerId: { in: memberships.map((m) => m.userId) } },
        select: { expoPushToken: true },
    });
    await sendPushToTokens({ ...payload, tokens: deviceTokens.map((row) => row.expoPushToken) });
}
/** Sends to every device token registered for the given driver id. */
async function sendPushToDriver(driverId, payload) {
    const deviceTokens = await prisma_1.prisma.deviceToken.findMany({
        where: { ownerType: "DRIVER", ownerId: driverId },
        select: { expoPushToken: true },
    });
    await sendPushToTokens({ ...payload, tokens: deviceTokens.map((row) => row.expoPushToken) });
}
