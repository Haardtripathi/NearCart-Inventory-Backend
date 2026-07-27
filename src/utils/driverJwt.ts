import jwt from "jsonwebtoken";

import { env } from "../config/env";
import type { DriverJwtPayload } from "../types/driverAuth";

/**
 * Driver tokens are signed with the same JWT_SECRET as org-user tokens (mirroring utils/jwt.ts)
 * but carry a distinct payload shape (`driverId` + `type: "driver"`) so a Driver JWT can never be
 * mistaken for / reused as a User JWT (or vice versa) by the respective authenticate middlewares
 * — a Driver is not a User (see prisma schema + modules/driver-auth). Expiry uses its own
 * DRIVER_JWT_EXPIRES_IN (short — default 1d) rather than the shared JWT_EXPIRES_IN used for org
 * staff, since DriverRefreshToken now provides the actual months-long session longevity via
 * rotation (see utils/driverRefreshToken.ts) — this access token only bridges the gap between
 * refreshes.
 */
export function signDriverAuthToken(payload: { driverId: string }) {
  return jwt.sign({ driverId: payload.driverId, type: "driver" } satisfies DriverJwtPayload, env.JWT_SECRET, {
    expiresIn: env.DRIVER_JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyDriverAuthToken(token: string): DriverJwtPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as Partial<DriverJwtPayload>;

  if (payload.type !== "driver" || !payload.driverId) {
    throw new Error("Not a valid driver token");
  }

  return payload as DriverJwtPayload;
}
