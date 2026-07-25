"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateDriver = authenticateDriver;
const client_1 = require("@prisma/client");
const prisma_1 = require("../config/prisma");
const ApiError_1 = require("../utils/ApiError");
const driverJwt_1 = require("../utils/driverJwt");
/**
 * Mirrors middlewares/auth.middleware.ts's `authenticate`, but for the driver-app JWT flow
 * (a Driver is not a User — see prisma schema + modules/driver-auth). Only VERIFIED drivers may
 * pass; PENDING_VERIFICATION/SUSPENDED drivers are rejected even with a technically-valid token
 * (e.g. a driver suspended after logging in should be cut off immediately on their next call).
 */
async function authenticateDriver(req, _res, next) {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
        return next(ApiError_1.ApiError.unauthorized("Missing or invalid authorization header"));
    }
    try {
        const token = authorization.replace("Bearer ", "").trim();
        const payload = (0, driverJwt_1.verifyDriverAuthToken)(token);
        const driver = await prisma_1.prisma.driver.findUnique({
            where: { id: payload.driverId },
            select: { id: true, status: true },
        });
        if (!driver) {
            throw ApiError_1.ApiError.unauthorized("Driver account not found");
        }
        if (driver.status !== client_1.DriverStatus.VERIFIED) {
            throw ApiError_1.ApiError.forbidden("Driver account is not currently verified");
        }
        req.driverAuth = { driverId: driver.id };
        next();
    }
    catch (error) {
        next(error instanceof ApiError_1.ApiError ? error : ApiError_1.ApiError.unauthorized("Invalid or expired token"));
    }
}
