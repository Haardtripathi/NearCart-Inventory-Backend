import { AuditAction, DriverStatus, Prisma } from "@prisma/client";
import bcrypt from "bcrypt";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { signDriverAuthToken } from "../../utils/driverJwt";
import {
  createDriverRefreshSession,
  revokeDriverRefreshSession,
  rotateDriverRefreshSession,
} from "../../utils/driverRefreshToken";
import { createAuditLog } from "../audit/audit.service";

interface RegisterDriverInput {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  vehicleType: string;
  vehicleNumber: string;
}

interface LoginDriverInput {
  phone?: string;
  email?: string;
  password: string;
}

/**
 * Thrown when a driver's credentials are correct but their account status blocks login. The
 * driver-auth controller catches this and responds with the exact `403 { error: { code, message
 * } }` shape locked in PHASE1_REQUIREMENTS.md's driver API contract — distinct from this
 * backend's normal `{success,message,errors}` ApiError envelope, since the driver app is built
 * against that literal shape.
 */
export class DriverStatusError extends Error {
  code: "DRIVER_NOT_VERIFIED" | "DRIVER_SUSPENDED";

  constructor(code: "DRIVER_NOT_VERIFIED" | "DRIVER_SUSPENDED", message: string) {
    super(message);
    this.code = code;
  }
}

function normalizeEmail(email?: string) {
  return email ? email.trim().toLowerCase() : undefined;
}

function normalizePhone(phone: string) {
  return phone.trim();
}

function serializeDriver(driver: {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  vehicleType: string;
  vehicleNumber: string;
  status: DriverStatus;
}) {
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

export async function registerDriver(input: RegisterDriverInput) {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);

  const existingByPhone = await prisma.driver.findUnique({
    where: { phone },
    select: { id: true },
  });

  if (existingByPhone) {
    throw ApiError.conflict("A driver account with this phone number already exists");
  }

  if (email) {
    const existingByEmail = await prisma.driver.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingByEmail) {
      throw ApiError.conflict("A driver account with this email already exists");
    }
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  let driver;

  try {
    driver = await prisma.driver.create({
      data: {
        fullName: input.fullName.trim(),
        phone,
        email: email ?? null,
        passwordHash,
        vehicleType: input.vehicleType.trim(),
        vehicleNumber: input.vehicleNumber.trim(),
        status: DriverStatus.PENDING_VERIFICATION,
      },
    });
  } catch (error) {
    // Narrow race: two concurrent registrations for the same phone/email both pass the
    // findUnique checks above before either commits. The @unique DB constraints already prevent
    // duplicate rows either way — this just turns the resulting P2002 into the same friendly
    // conflict response the pre-check above gives, instead of a raw 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw ApiError.conflict("A driver account with this phone number or email already exists");
    }

    throw error;
  }

  await createAuditLog(prisma, {
    action: AuditAction.DRIVER_REGISTER,
    entityType: "Driver",
    entityId: driver.id,
    after: serializeDriver(driver),
  });

  return serializeDriver(driver);
}

export async function loginDriver(input: LoginDriverInput) {
  const phone = input.phone ? normalizePhone(input.phone) : undefined;
  const email = normalizeEmail(input.email);

  const driver = await prisma.driver.findFirst({
    where: phone ? { phone } : { email },
  });

  if (!driver) {
    throw ApiError.unauthorized("Invalid phone/email or password");
  }

  const passwordMatches = await bcrypt.compare(input.password, driver.passwordHash);

  if (!passwordMatches) {
    throw ApiError.unauthorized("Invalid phone/email or password");
  }

  if (driver.status === DriverStatus.SUSPENDED) {
    throw new DriverStatusError("DRIVER_SUSPENDED", "Your driver account has been suspended.");
  }

  if (driver.status !== DriverStatus.VERIFIED) {
    throw new DriverStatusError(
      "DRIVER_NOT_VERIFIED",
      "Your driver account is still pending verification. We'll notify you once it's approved.",
    );
  }

  const token = signDriverAuthToken({ driverId: driver.id });
  const refreshToken = await createDriverRefreshSession(driver.id);

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
export async function refreshDriverSession(rawRefreshToken: string) {
  const { driverId, refreshToken } = await rotateDriverRefreshSession(rawRefreshToken);

  const driver = await prisma.driver.findUnique({ where: { id: driverId } });

  if (!driver) {
    throw ApiError.unauthorized("Driver account not found");
  }

  if (driver.status === DriverStatus.SUSPENDED) {
    throw new DriverStatusError("DRIVER_SUSPENDED", "Your driver account has been suspended.");
  }

  if (driver.status !== DriverStatus.VERIFIED) {
    throw new DriverStatusError(
      "DRIVER_NOT_VERIFIED",
      "Your driver account is still pending verification. We'll notify you once it's approved.",
    );
  }

  const token = signDriverAuthToken({ driverId: driver.id });

  return {
    token,
    refreshToken,
    driver: serializeDriver(driver),
  };
}

/** Revokes a single refresh session (logout). Access tokens are short-lived (1d default) and not
 * separately blocklisted — same tradeoff NearCart's own refresh design already accepts. */
export async function logoutDriver(rawRefreshToken: string) {
  await revokeDriverRefreshSession(rawRefreshToken);
}
