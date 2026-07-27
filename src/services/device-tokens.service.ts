import { prisma } from "../config/prisma";

/**
 * Upserts a DeviceToken row for either a shop-staff User or a Driver (see prisma schema's
 * polymorphic DeviceToken model — ownerType discriminates which table ownerId points into).
 * Called from `POST /api/users/device-token` and `POST /api/driver/device-token` respectively.
 * Idempotent: re-registering the same (ownerType, ownerId, expoPushToken) tuple just refreshes
 * `platform`/`updatedAt` rather than erroring, since a device may re-register its token on every
 * app launch.
 */
export async function upsertDeviceToken(
  ownerType: "USER" | "DRIVER",
  ownerId: string,
  input: { expoPushToken: string; platform?: string },
) {
  return prisma.deviceToken.upsert({
    where: {
      ownerType_ownerId_expoPushToken: {
        ownerType,
        ownerId,
        expoPushToken: input.expoPushToken,
      },
    },
    create: {
      ownerType,
      ownerId,
      expoPushToken: input.expoPushToken,
      platform: input.platform ?? null,
    },
    update: {
      platform: input.platform ?? null,
    },
  });
}
