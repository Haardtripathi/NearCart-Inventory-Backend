import jwt from "jsonwebtoken";

import { env } from "../config/env";
import type { DriverJwtPayload } from "../types/driverAuth";

/**
 * Driver tokens are signed with the same JWT_SECRET as org-user tokens (mirroring utils/jwt.ts)
 * but carry a distinct payload shape (`driverId` + `type: "driver"`) so a Driver JWT can never be
 * mistaken for / reused as a User JWT (or vice versa) by the respective authenticate middlewares
 * — a Driver is not a User (see prisma schema + modules/driver-auth).
 */
export function signDriverAuthToken(payload: { driverId: string }) {
  return jwt.sign({ driverId: payload.driverId, type: "driver" } satisfies DriverJwtPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyDriverAuthToken(token: string): DriverJwtPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as Partial<DriverJwtPayload>;

  if (payload.type !== "driver" || !payload.driverId) {
    throw new Error("Not a valid driver token");
  }

  return payload as DriverJwtPayload;
}
