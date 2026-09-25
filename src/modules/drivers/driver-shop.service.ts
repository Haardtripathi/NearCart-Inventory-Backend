import { randomInt } from "node:crypto";

import { AuditAction, DriverStatus, Prisma, SalesOrderStatus } from "@prisma/client";

import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import type { DbClient } from "../../types/prisma";
import { ApiError } from "../../utils/ApiError";
import { assertBranchInOrg } from "../../utils/guards";
import { isUniqueConstraintError } from "../../utils/prismaErrors";
import { createAuditLog } from "../audit/audit.service";

/**
 * SHOP-OWNED DRIVERS (2026-09-24).
 *
 * A manager generates a one-time code for one of their branches; a driver redeems it (at signup or
 * later from their profile) and becomes that branch's own driver: `Driver.shopBranchId`. From then
 * on matching only ever gives them that branch's orders (see findNearestFreeDriver /
 * findNearestUnassignedOrderForDriver), so they never hear about other shops' deliveries. A shop
 * driver still needs the normal NearCart admin approval before they can work. Removing them (shop)
 * or leaving (driver) clears the link and they are an ordinary NearCart driver again.
 */

/** No 0/O, 1/I/L — the code is read aloud or copied off the owner's screen. */
const SHOP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SHOP_CODE_LENGTH = 6;
export const SHOP_CODE_TTL_MS = 3 * 60_000;

const INVALID_CODE_MESSAGE = "This store code is invalid or has expired. Ask the shop for a new one.";

const INTERACTIVE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

const ACTIVE_ORDER_STATUSES = [SalesOrderStatus.READY, SalesOrderStatus.OUT_FOR_DELIVERY];

function generateShopCode() {
  let code = "";
  for (let index = 0; index < SHOP_CODE_LENGTH; index += 1) {
    code += SHOP_CODE_ALPHABET[randomInt(SHOP_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeShopCode(raw: string) {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/* ─────────────────────────────── Shop (manager) side ─────────────────────────────── */

export async function createDriverShopCode(organizationId: string, branchId: string, actorUserId: string) {
  const branch = await assertBranchInOrg(prisma, organizationId, branchId);
  const expiresAt = new Date(Date.now() + SHOP_CODE_TTL_MS);

  // A collision against any code ever issued is ~1 in 887M per attempt; retry rather than reason
  // about which old codes could be reused.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateShopCode();
    try {
      await prisma.driverShopCode.create({
        data: { code, organizationId, branchId, createdById: actorUserId, expiresAt },
      });
      await createAuditLog(prisma, {
        organizationId,
        actorUserId,
        action: AuditAction.DRIVER_SHOP_CODE_CREATE,
        entityType: "Branch",
        entityId: branchId,
        // The code itself is deliberately not logged — it's a short-lived credential.
        meta: { expiresAt },
      });
      return { code, expiresAt, branch: { id: branch.id, name: branch.name } };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && isUniqueConstraintError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw ApiError.serviceUnavailable("Couldn't generate a store code right now. Please try again.");
}

/** Every driver linked to one of this organization's branches, any approval status. */
export async function listShopDrivers(organizationId: string, branchIds?: string[]) {
  const drivers = await prisma.driver.findMany({
    where: {
      shopBranch: { organizationId },
      ...(branchIds ? { shopBranchId: { in: branchIds } } : {}),
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      vehicleType: true,
      vehicleNumber: true,
      status: true,
      shopJoinedAt: true,
      isAvailableForAssignment: true,
      lastLocationAt: true,
      shopBranch: { select: { id: true, name: true } },
      _count: { select: { assignedOrders: { where: { status: { in: ACTIVE_ORDER_STATUSES } } } } },
    },
    orderBy: [{ shopJoinedAt: "desc" }],
  });

  const freshSince = Date.now() - env.DRIVER_LOCATION_STALE_MINUTES * 60_000;

  return drivers.map((driver) => ({
    id: driver.id,
    fullName: driver.fullName,
    phone: driver.phone,
    vehicleType: driver.vehicleType,
    vehicleNumber: driver.vehicleNumber,
    status: driver.status,
    joinedAt: driver.shopJoinedAt,
    branch: driver.shopBranch,
    isOnline:
      driver.isAvailableForAssignment && driver.lastLocationAt != null && driver.lastLocationAt.getTime() >= freshSince,
    isBusy: driver._count.assignedOrders > 0,
  }));
}

/** The shop ends the link; the driver becomes a general NearCart driver. An order they are already
 *  carrying stays with them. `assertAccess` enforces the caller's branch-scoped access. */
export async function removeShopDriver(
  organizationId: string,
  driverId: string,
  actorUserId: string,
  assertAccess: (branchId: string) => void,
) {
  const driver = await prisma.driver.findFirst({
    where: { id: driverId, shopBranch: { organizationId } },
    select: { id: true, shopBranchId: true },
  });

  if (!driver || !driver.shopBranchId) {
    throw ApiError.notFound("This driver is not one of your shop's drivers");
  }

  assertAccess(driver.shopBranchId);

  const { count } = await prisma.driver.updateMany({
    where: { id: driverId, shopBranchId: driver.shopBranchId },
    data: { shopBranchId: null, shopJoinedAt: null },
  });

  if (count > 0) {
    await createAuditLog(prisma, {
      organizationId,
      actorUserId,
      action: AuditAction.DRIVER_SHOP_LEAVE,
      entityType: "Driver",
      entityId: driverId,
      meta: { branchId: driver.shopBranchId, removedBy: "SHOP" },
    });
  }

  return { id: driverId };
}

/* ─────────────────────────────── Driver side ─────────────────────────────── */

/**
 * Consumes a code for `driverId` inside the caller's transaction. The `usedAt: null` +
 * `expiresAt > now` guard lives in the UPDATE itself, so two drivers racing for one code can't both
 * win — whoever's statement lands second updates zero rows and is told the code is invalid.
 */
export async function redeemDriverShopCode(tx: DbClient, driverId: string, rawCode: string) {
  const code = normalizeShopCode(rawCode);
  const now = new Date();

  const record = await tx.driverShopCode.findUnique({
    where: { code },
    select: {
      id: true,
      branchId: true,
      organizationId: true,
      usedAt: true,
      expiresAt: true,
      branch: { select: { id: true, name: true, deletedAt: true, organization: { select: { name: true } } } },
    },
  });

  if (!record || record.usedAt || record.expiresAt <= now || record.branch.deletedAt) {
    throw ApiError.badRequest(INVALID_CODE_MESSAGE);
  }

  const { count } = await tx.driverShopCode.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now, usedByDriverId: driverId },
  });

  if (count === 0) {
    throw ApiError.badRequest(INVALID_CODE_MESSAGE);
  }

  await tx.driver.update({
    where: { id: driverId },
    data: { shopBranchId: record.branchId, shopJoinedAt: now },
  });

  await createAuditLog(tx, {
    organizationId: record.organizationId,
    action: AuditAction.DRIVER_SHOP_JOIN,
    entityType: "Driver",
    entityId: driverId,
    meta: { branchId: record.branchId },
  });

  return record;
}

export async function getDriverShop(driverId: string) {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: {
      shopJoinedAt: true,
      shopBranch: { select: { id: true, name: true, city: true, organization: { select: { name: true } } } },
    },
  });

  if (!driver?.shopBranch) {
    return { shop: null };
  }

  return {
    shop: {
      branchId: driver.shopBranch.id,
      branchName: driver.shopBranch.name,
      city: driver.shopBranch.city,
      shopName: driver.shopBranch.organization.name,
      joinedAt: driver.shopJoinedAt,
    },
  };
}

/** An existing (already approved) driver joins a shop from their profile. */
export async function joinDriverShop(driverId: string, rawCode: string) {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: {
      status: true,
      shopBranch: { select: { name: true, organization: { select: { name: true } } } },
      _count: { select: { assignedOrders: { where: { status: { in: ACTIVE_ORDER_STATUSES } } } } },
    },
  });

  if (!driver) {
    throw ApiError.notFound("Driver not found");
  }

  if (driver.shopBranch) {
    throw ApiError.conflict(
      `You're already a driver for ${driver.shopBranch.organization.name} (${driver.shopBranch.name}). Leave that shop first.`,
    );
  }

  // Joining narrows which orders they may carry; don't pull that out from under a live delivery.
  if (driver._count.assignedOrders > 0) {
    throw ApiError.conflict("Finish your current delivery before joining a shop.");
  }

  if (driver.status === DriverStatus.SUSPENDED) {
    throw ApiError.forbidden("Your account is suspended.");
  }

  await prisma.$transaction((tx) => redeemDriverShopCode(tx, driverId, rawCode), INTERACTIVE_TRANSACTION_OPTIONS);

  return getDriverShop(driverId);
}

export async function leaveDriverShop(driverId: string) {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { shopBranchId: true, shopBranch: { select: { organizationId: true } } },
  });

  if (!driver?.shopBranchId || !driver.shopBranch) {
    throw ApiError.badRequest("You're not linked to any shop.");
  }

  await prisma.driver.update({ where: { id: driverId }, data: { shopBranchId: null, shopJoinedAt: null } });

  await createAuditLog(prisma, {
    organizationId: driver.shopBranch.organizationId,
    action: AuditAction.DRIVER_SHOP_LEAVE,
    entityType: "Driver",
    entityId: driverId,
    meta: { branchId: driver.shopBranchId, removedBy: "DRIVER" },
  });

  return { shop: null };
}
