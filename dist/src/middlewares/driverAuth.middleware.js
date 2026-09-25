"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateDriver = authenticateDriver;
exports.authenticateDriverForVerification = authenticateDriverForVerification;
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
/**
 * Mounted on driver-verification.route.ts ONLY — accepts EITHER a normal full driver session
 * token (same as `authenticateDriver` above, for a VERIFIED driver re-visiting Documents/re-
 * verifying post-onboarding, per that router's own doc comments) OR the narrower
 * `driver-verification-pending` token (see driverJwt.ts's signDriverVerificationPendingToken) for
 * a driver who is still PENDING_VERIFICATION and therefore has no way to get a full session at
 * all. Both paths populate the same `req.driverAuth = {driverId}` shape so this router's
 * controllers don't need to know which kind of token got them there. Bug fix (chicken-and-egg
 * closed): before this existed, `driverVerificationRouter` used plain `authenticateDriver`, which
 * — like `loginDriver` — flatly refuses any PENDING_VERIFICATION driver, so the vehicle-photo/
 * license evidence this router exists to collect could structurally never be submitted before a
 * SUPER_ADMIN had already approved the driver blind. This does NOT widen what a driver can do
 * beyond evidence submission: it's mounted nowhere else, and nothing reachable through it (see
 * driver-verification.service.ts) writes `Driver.status` — only `platform.service.ts`'s
 * SUPER_ADMIN-gated `verifyPlatformDriver` does — so a pending token can never self-approve.
 */
async function authenticateDriverForVerification(req, _res, next) {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
        return next(ApiError_1.ApiError.unauthorized("Missing or invalid authorization header"));
    }
    const token = authorization.replace("Bearer ", "").trim();
    try {
        const payload = (0, driverJwt_1.verifyDriverAuthToken)(token);
        const driver = await prisma_1.prisma.driver.findUnique({
            where: { id: payload.driverId },
            select: { id: true, status: true },
        });
        if (!driver) {
            return next(ApiError_1.ApiError.unauthorized("Driver account not found"));
        }
        if (driver.status !== client_1.DriverStatus.VERIFIED) {
            // A structurally valid full-driver token for a non-VERIFIED driver is a real error, not a
            // signal to fall through to the pending-token branch below (that branch decodes the SAME
            // token string, which would just fail signature/type checks again there too) — surface it
            // directly with the accurate reason.
            return next(ApiError_1.ApiError.forbidden("Driver account is not currently verified"));
        }
        req.driverAuth = { driverId: driver.id };
        return next();
    }
    catch (error) {
        if (error instanceof ApiError_1.ApiError) {
            return next(error);
        }
        // Not a full driver token (wrong `type` claim, bad signature, or expired) — fall through and
        // try it as a verification-pending token instead.
    }
    try {
        const payload = (0, driverJwt_1.verifyDriverVerificationPendingToken)(token);
        const driver = await prisma_1.prisma.driver.findUnique({
            where: { id: payload.driverId },
            select: { id: true, status: true },
        });
        if (!driver) {
            return next(ApiError_1.ApiError.unauthorized("Driver account not found"));
        }
        if (driver.status !== client_1.DriverStatus.PENDING_VERIFICATION) {
            return next(ApiError_1.ApiError.forbidden(driver.status === client_1.DriverStatus.VERIFIED
                ? "Your account is already verified — please log in to continue."
                : "Your driver account is not eligible to submit verification evidence right now."));
        }
        req.driverAuth = { driverId: driver.id };
        return next();
    }
    catch (error) {
        return next(error instanceof ApiError_1.ApiError ? error : ApiError_1.ApiError.unauthorized("Invalid or expired token"));
    }
}
