import type { NextFunction, Request, Response } from "express";
import { DriverStatus } from "@prisma/client";

import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { verifyDriverAuthToken } from "../utils/driverJwt";

/**
 * Mirrors middlewares/auth.middleware.ts's `authenticate`, but for the driver-app JWT flow
 * (a Driver is not a User — see prisma schema + modules/driver-auth). Only VERIFIED drivers may
 * pass; PENDING_VERIFICATION/SUSPENDED drivers are rejected even with a technically-valid token
 * (e.g. a driver suspended after logging in should be cut off immediately on their next call).
 */
export async function authenticateDriver(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing or invalid authorization header"));
  }

  try {
    const token = authorization.replace("Bearer ", "").trim();
    const payload = verifyDriverAuthToken(token);

    const driver = await prisma.driver.findUnique({
      where: { id: payload.driverId },
      select: { id: true, status: true },
    });

    if (!driver) {
      throw ApiError.unauthorized("Driver account not found");
    }

    if (driver.status !== DriverStatus.VERIFIED) {
      throw ApiError.forbidden("Driver account is not currently verified");
    }

    req.driverAuth = { driverId: driver.id };

    next();
  } catch (error) {
    next(error instanceof ApiError ? error : ApiError.unauthorized("Invalid or expired token"));
  }
}
