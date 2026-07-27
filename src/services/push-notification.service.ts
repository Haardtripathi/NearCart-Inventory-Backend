import { getMessaging } from "firebase-admin/messaging";

import { prisma } from "../config/prisma";
import { getFirebaseApp } from "../config/firebase";

interface SendPushInput {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  // 'order_alert' is the loud/high-importance channel used for events that shouldn't be missed
  // (new order for shop staff, new assignment for a driver) — see each app's notification-channel
  // setup.
  channelId?: "default" | "order_alert";
}

/**
 * Thin wrapper over admin.messaging().sendEachForMulticast(). No-ops with a logged warning (not
 * a thrown error) when Firebase isn't configured yet, or when there are no tokens to send to.
 *
 * Bug fixed 2026-07-27 (found via audit, same class as the order-confirmation-sweep crash): every
 * caller of sendPushToDriver/sendPushToOrgStaff invokes it as `void sendPushToDriver(...)` /
 * `void sendPushToOrgStaff(...)` — fire-and-forget, with a comment right at the call site claiming
 * "a push failure must never fail order creation/assignment". That guarantee didn't actually hold:
 * this function had no try/catch, so a Firebase error (bad credentials, network blip, malformed
 * multicast payload, a `messaging/*` API error) rejected the promise, and with no `.catch()` at
 * any `void`-fired call site that becomes an unhandled promise rejection — which crashes the whole
 * process, exactly like the cron bug. Wrapping the send (and the stale-token cleanup) in try/catch
 * here, once, makes every current and future fire-and-forget caller safe by construction instead
 * of relying on each call site to remember `.catch()`.
 *
 * The try/catch deliberately wraps `getFirebaseApp()` too, not just the send call: confirmed live
 * (fake/malformed FIREBASE_PRIVATE_KEY) that `initializeApp()`/`cert()` inside getFirebaseApp can
 * itself throw synchronously (`FirebaseAppError: Failed to parse private key`) — an earlier version
 * of this fix left that call outside the try block, which still let a bad-credentials crash through
 * on the very first push attempt after misconfigured Firebase env vars were deployed.
 */
async function sendPushToTokens(input: SendPushInput): Promise<void> {
  if (input.tokens.length === 0) {
    return;
  }

  try {
    const app = getFirebaseApp();

    if (!app) {
      console.warn(
        `[push-notification] Firebase not configured — skipping push "${input.title}" to ${input.tokens.length} token(s).`,
      );
      return;
    }

    const response = await getMessaging(app).sendEachForMulticast({
      tokens: input.tokens,
      notification: { title: input.title, body: input.body },
      data: input.data,
      android: {
        notification: {
          channelId: input.channelId ?? "default",
          sound: input.channelId === "order_alert" ? "order_alert" : "default",
        },
      },
    });

    const staleTokens = response.responses
      .map((result, index: number) =>
        !result.success && result.error?.code === "messaging/registration-token-not-registered"
          ? input.tokens[index]
          : null,
      )
      .filter((token): token is string => token !== null);

    if (staleTokens.length > 0) {
      await prisma.deviceToken.deleteMany({ where: { expoPushToken: { in: staleTokens } } });
    }
  } catch (error) {
    console.warn(`[push-notification] Failed to send push "${input.title}" — continuing without it`, error);
  }
}

/** Sends to every device token registered for every User with an active membership on this org. */
async function sendPushToOrgStaff(
  organizationId: string,
  payload: Omit<SendPushInput, "tokens">,
): Promise<void> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { userId: true },
  });

  if (memberships.length === 0) {
    return;
  }

  const deviceTokens = await prisma.deviceToken.findMany({
    where: { ownerType: "USER", ownerId: { in: memberships.map((m) => m.userId) } },
    select: { expoPushToken: true },
  });

  await sendPushToTokens({ ...payload, tokens: deviceTokens.map((row) => row.expoPushToken) });
}

/** Sends to every device token registered for the given driver id. */
async function sendPushToDriver(
  driverId: string,
  payload: Omit<SendPushInput, "tokens">,
): Promise<void> {
  const deviceTokens = await prisma.deviceToken.findMany({
    where: { ownerType: "DRIVER", ownerId: driverId },
    select: { expoPushToken: true },
  });

  await sendPushToTokens({ ...payload, tokens: deviceTokens.map((row) => row.expoPushToken) });
}

export { sendPushToDriver, sendPushToOrgStaff, sendPushToTokens };
