"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signDriverAuthToken = signDriverAuthToken;
exports.verifyDriverAuthToken = verifyDriverAuthToken;
exports.signDriverVerificationPendingToken = signDriverVerificationPendingToken;
exports.verifyDriverVerificationPendingToken = verifyDriverVerificationPendingToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
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
function signDriverAuthToken(payload) {
    return jsonwebtoken_1.default.sign({ driverId: payload.driverId, type: "driver" }, env_1.env.JWT_SECRET, {
        expiresIn: env_1.env.DRIVER_JWT_EXPIRES_IN,
    });
}
function verifyDriverAuthToken(token) {
    const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
    if (payload.type !== "driver" || !payload.driverId) {
        throw new Error("Not a valid driver token");
    }
    return payload;
}
/**
 * Issued to a PENDING_VERIFICATION driver (at registration, and again on every login attempt
 * while still pending — see driver-auth.service.ts's registerDriver/loginDriver) so they can
 * submit vehicle/license verification evidence BEFORE a SUPER_ADMIN approves them — closing the
 * chicken-and-egg gap where `authenticateDriver`/`loginDriver` refuse any token/session at all
 * until a driver is already VERIFIED, making the manual-review evidence endpoints structurally
 * unreachable in the order they're meant to run. Deliberately a different `type` (and consumed by
 * a different middleware, `authenticateDriverForVerification`) from the full driver session token
 * signed by `signDriverAuthToken` above — this token authenticates ONLY the
 * driver-verification.route.ts endpoints, never the full driver API (orders, availability,
 * location, earnings), and nothing in that router (or anywhere else) lets it write `Driver.status`
 * — only `platform.service.ts`'s SUPER_ADMIN-gated `verifyPlatformDriver` does — so holding this
 * token can never be used to self-approve, only to submit evidence for a human to review.
 */
function signDriverVerificationPendingToken(payload) {
    return jsonwebtoken_1.default.sign({ driverId: payload.driverId, type: "driver-verification-pending" }, env_1.env.JWT_SECRET, { expiresIn: env_1.env.DRIVER_VERIFICATION_PENDING_JWT_EXPIRES_IN });
}
function verifyDriverVerificationPendingToken(token) {
    const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
    if (payload.type !== "driver-verification-pending" || !payload.driverId) {
        throw new Error("Not a valid driver verification token");
    }
    return payload;
}
