"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriverStatusError = void 0;
exports.registerDriver = registerDriver;
exports.loginDriver = loginDriver;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const driverJwt_1 = require("../../utils/driverJwt");
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
        // duplicate rows either way — this just turns the resulting P2002 into the same friendly
        // conflict response the pre-check above gives, instead of a raw 500.
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
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
    return {
        token,
        driver: serializeDriver(driver),
    };
}
