"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriverStatusError = void 0;
exports.registerDriver = registerDriver;
exports.loginDriver = loginDriver;
exports.refreshDriverSession = refreshDriverSession;
exports.logoutDriver = logoutDriver;
exports.sendDriverEmailVerificationOtp = sendDriverEmailVerificationOtp;
exports.verifyDriverEmailVerificationOtp = verifyDriverEmailVerificationOtp;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const env_1 = require("../../config/env");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const driverJwt_1 = require("../../utils/driverJwt");
const driverRefreshToken_1 = require("../../utils/driverRefreshToken");
const mailer_1 = require("../../utils/mailer");
const otp_1 = require("../../utils/otp");
const prismaErrors_1 = require("../../utils/prismaErrors");
const audit_service_1 = require("../audit/audit.service");
/**
 * Thrown when a driver's credentials are correct but their account status blocks login. The
 * driver-auth controller catches this and responds with the exact `403 { error: { code, message
 * } }` shape locked in PHASE1_REQUIREMENTS.md's driver API contract — distinct from this
 * backend's normal `{success,message,errors}` ApiError envelope, since the driver app is built
 * against that literal shape.
 */
class DriverStatusError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.DriverStatusError = DriverStatusError;
function normalizeEmail(email) {
    return email ? email.trim().toLowerCase() : undefined;
}
function normalizePhone(phone) {
    return phone.trim();
}
function serializeDriver(driver) {
    return {
        id: driver.id,
        fullName: driver.fullName,
        phone: driver.phone,
        email: driver.email,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        status: driver.status,
        emailVerified: driver.emailVerified,
    };
}
async function registerDriver(input) {
    const phone = normalizePhone(input.phone);
    const email = normalizeEmail(input.email);
    const existingByPhone = await prisma_1.prisma.driver.findUnique({
        where: { phone },
        select: { id: true },
    });
    if (existingByPhone) {
        throw ApiError_1.ApiError.conflict("A driver account with this phone number already exists");
    }
    if (email) {
        const existingByEmail = await prisma_1.prisma.driver.findUnique({
            where: { email },
            select: { id: true },
        });
        if (existingByEmail) {
            throw ApiError_1.ApiError.conflict("A driver account with this email already exists");
        }
    }
    const passwordHash = await bcrypt_1.default.hash(input.password, 12);
    let driver;
    try {
        driver = await prisma_1.prisma.driver.create({
            data: {
                fullName: input.fullName.trim(),
                phone,
                email: email ?? null,
                passwordHash,
                vehicleType: input.vehicleType.trim(),
                vehicleNumber: input.vehicleNumber.trim(),
                status: client_1.DriverStatus.PENDING_VERIFICATION,
            },
        });
    }
    catch (error) {
        // Narrow race: two concurrent registrations for the same phone/email both pass the
        // findUnique checks above before either commits. The @unique DB constraints already prevent
        // duplicate rows either way — this just turns the resulting unique-constraint violation into
        // the same friendly conflict response the pre-check above gives, instead of a raw 500. See
        // utils/prismaErrors.ts — can't compare `error.code === "P2002"` directly under this adapter.
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && (0, prismaErrors_1.isUniqueConstraintError)(error)) {
            throw ApiError_1.ApiError.conflict("A driver account with this phone number or email already exists");
        }
        throw error;
    }
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        action: client_1.AuditAction.DRIVER_REGISTER,
        entityType: "Driver",
        entityId: driver.id,
        after: serializeDriver(driver),
    });
    return serializeDriver(driver);
}
async function loginDriver(input) {
    const phone = input.phone ? normalizePhone(input.phone) : undefined;
    const email = normalizeEmail(input.email);
    const driver = await prisma_1.prisma.driver.findFirst({
        where: phone ? { phone } : { email },
    });
    if (!driver) {
        throw ApiError_1.ApiError.unauthorized("Invalid phone/email or password");
    }
    const passwordMatches = await bcrypt_1.default.compare(input.password, driver.passwordHash);
    if (!passwordMatches) {
        throw ApiError_1.ApiError.unauthorized("Invalid phone/email or password");
    }
    if (driver.status === client_1.DriverStatus.SUSPENDED) {
        throw new DriverStatusError("DRIVER_SUSPENDED", "Your driver account has been suspended.");
    }
    if (driver.status !== client_1.DriverStatus.VERIFIED) {
        throw new DriverStatusError("DRIVER_NOT_VERIFIED", "Your driver account is still pending verification. We'll notify you once it's approved.");
    }
    const token = (0, driverJwt_1.signDriverAuthToken)({ driverId: driver.id });
    const refreshToken = await (0, driverRefreshToken_1.createDriverRefreshSession)(driver.id);
    return {
        token,
        refreshToken,
        driver: serializeDriver(driver),
    };
}
/**
 * Exchanges a valid (unexpired, unrevoked) refresh token for a new access token, rotating the
 * refresh token in the same call (old one revoked, new one issued) — same pattern as NearCart's
 * mobile refresh flow. Re-checks the driver's current status on every refresh (not just at
 * login), so a driver suspended after logging in loses access on their very next silent refresh,
 * not just their next login.
 */
async function refreshDriverSession(rawRefreshToken) {
    const { driverId, refreshToken } = await (0, driverRefreshToken_1.rotateDriverRefreshSession)(rawRefreshToken);
    const driver = await prisma_1.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
        throw ApiError_1.ApiError.unauthorized("Driver account not found");
    }
    if (driver.status === client_1.DriverStatus.SUSPENDED) {
        throw new DriverStatusError("DRIVER_SUSPENDED", "Your driver account has been suspended.");
    }
    if (driver.status !== client_1.DriverStatus.VERIFIED) {
        throw new DriverStatusError("DRIVER_NOT_VERIFIED", "Your driver account is still pending verification. We'll notify you once it's approved.");
    }
    const token = (0, driverJwt_1.signDriverAuthToken)({ driverId: driver.id });
    return {
        token,
        refreshToken,
        driver: serializeDriver(driver),
    };
}
/** Revokes a single refresh session (logout). Access tokens are short-lived (1d default) and not
 * separately blocklisted — same tradeoff NearCart's own refresh design already accepts. */
async function logoutDriver(rawRefreshToken) {
    await (0, driverRefreshToken_1.revokeDriverRefreshSession)(rawRefreshToken);
}
const DRIVER_EMAIL_VERIFY_OTP_PURPOSE = "driver-email-verify";
/**
 * Email OTP verification for a `Driver` — an ADDITIONAL trust signal layered on top of (not a
 * replacement for) the admin manual-review gate: a driver can complete this while `status` is
 * still PENDING_VERIFICATION, and login stays blocked by `loginDriver`'s status check regardless
 * of `emailVerified`. Mirrors modules/auth/auth.service.ts's sendEmailVerificationOtp /
 * verifyEmailVerificationOtp for `User` almost exactly (same `issueOtp`/`verifyOtp` Redis-backed
 * helpers, same renderOtpEmail template, same anti-enumeration "respond the same either way"
 * behavior) — reusing that existing OTP infra rather than building a second one.
 *
 * DESIGN DECISION — no bearer token / driver-auth middleware guards these two endpoints. A
 * PENDING_VERIFICATION driver has no way to authenticate at all today: registerDriver() issues no
 * token (by design — see driver-auth.controller.ts), and authenticateDriver's middleware rejects
 * anything but a VERIFIED driver's JWT even if one existed. Rather than inventing a new
 * limited-scope "pre-verification" JWT type (extra token type to secure, extra surface on
 * driverJwt.ts, extra thing for the mobile app to store safely) purely to gate two endpoints whose
 * real security boundary is "does this person control the inbox at `email`" — which the mailed
 * OTP code itself already proves — this instead mirrors the *existing, already-shipped* pattern
 * for org-staff Users one module over (auth.route.ts's POST /auth/send-otp and /auth/verify-otp,
 * also unauthenticated, also identify the subject by `email` in the body). Same tradeoff already
 * accepted elsewhere in this codebase, applied consistently to Driver instead of introducing a
 * second, different auth pattern for what is functionally the same problem.
 */
async function sendDriverEmailVerificationOtp(input) {
    const email = normalizeEmail(input.email);
    if (!email) {
        throw ApiError_1.ApiError.badRequest("A valid email is required");
    }
    const driver = await prisma_1.prisma.driver.findUnique({
        where: { email },
        select: { id: true, fullName: true, emailVerified: true },
    });
    // Same anti-enumeration behavior as the User equivalent: respond identically whether or not
    // this email is registered to a driver, or already verified, so this endpoint can't be used to
    // probe which emails have driver accounts.
    if (!driver || driver.emailVerified) {
        return { sent: true };
    }
    const code = await (0, otp_1.issueOtp)(DRIVER_EMAIL_VERIFY_OTP_PURPOSE, driver.id);
    const { html, text } = (0, mailer_1.renderOtpEmail)({ code, ttlMinutes: env_1.env.OTP_TTL_MINUTES });
    await (0, mailer_1.sendMail)({
        to: email,
        subject: "Verify your NearCart Driver email",
        html,
        text,
    });
    return { sent: true };
}
async function verifyDriverEmailVerificationOtp(input) {
    const email = normalizeEmail(input.email);
    if (!email) {
        throw ApiError_1.ApiError.badRequest("A valid email is required");
    }
    const driver = await prisma_1.prisma.driver.findUnique({ where: { email } });
    if (!driver) {
        throw ApiError_1.ApiError.badRequest("This code has expired or was not requested. Please request a new one.");
    }
    if (driver.emailVerified) {
        return { emailVerified: true, driver: serializeDriver(driver) };
    }
    // verifyOtp throws ApiError.badRequest on a missing/expired/incorrect code (see utils/otp.ts) —
    // propagates as-is, no Driver row is touched unless the code actually matched.
    await (0, otp_1.verifyOtp)(DRIVER_EMAIL_VERIFY_OTP_PURPOSE, driver.id, input.code);
    const updated = await prisma_1.prisma.driver.update({
        where: { id: driver.id },
        data: { emailVerified: true },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        action: client_1.AuditAction.DRIVER_EMAIL_VERIFY,
        entityType: "Driver",
        entityId: updated.id,
        before: { emailVerified: false },
        after: { emailVerified: true },
    });
    return { emailVerified: true, driver: serializeDriver(updated) };
}
