"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHOP_CODE_TTL_MS = void 0;
exports.normalizeShopCode = normalizeShopCode;
exports.createDriverShopCode = createDriverShopCode;
exports.listShopDrivers = listShopDrivers;
exports.removeShopDriver = removeShopDriver;
exports.redeemDriverShopCode = redeemDriverShopCode;
exports.getDriverShop = getDriverShop;
exports.joinDriverShop = joinDriverShop;
exports.leaveDriverShop = leaveDriverShop;
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const env_1 = require("../../config/env");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const guards_1 = require("../../utils/guards");
const prismaErrors_1 = require("../../utils/prismaErrors");
const audit_service_1 = require("../audit/audit.service");
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
exports.SHOP_CODE_TTL_MS = 3 * 60_000;
const INVALID_CODE_MESSAGE = "This store code is invalid or has expired. Ask the shop for a new one.";
const INTERACTIVE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 };
const ACTIVE_ORDER_STATUSES = [client_1.SalesOrderStatus.READY, client_1.SalesOrderStatus.OUT_FOR_DELIVERY];
function generateShopCode() {
    let code = "";
    for (let index = 0; index < SHOP_CODE_LENGTH; index += 1) {
        code += SHOP_CODE_ALPHABET[(0, node_crypto_1.randomInt)(SHOP_CODE_ALPHABET.length)];
    }
    return code;
}
function normalizeShopCode(raw) {
    return raw.replace(/\s+/g, "").toUpperCase();
}
/* ─────────────────────────────── Shop (manager) side ─────────────────────────────── */
async function createDriverShopCode(organizationId, branchId, actorUserId) {
    const branch = await (0, guards_1.assertBranchInOrg)(prisma_1.prisma, organizationId, branchId);
    const expiresAt = new Date(Date.now() + exports.SHOP_CODE_TTL_MS);
    // A collision against any code ever issued is ~1 in 887M per attempt; retry rather than reason
    // about which old codes could be reused.
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = generateShopCode();
        try {
            await prisma_1.prisma.driverShopCode.create({
                data: { code, organizationId, branchId, createdById: actorUserId, expiresAt },
            });
            await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
                organizationId,
                actorUserId,
                action: client_1.AuditAction.DRIVER_SHOP_CODE_CREATE,
                entityType: "Branch",
                entityId: branchId,
                // The code itself is deliberately not logged — it's a short-lived credential.
                meta: { expiresAt },
            });
            return { code, expiresAt, branch: { id: branch.id, name: branch.name } };
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && (0, prismaErrors_1.isUniqueConstraintError)(error)) {
                continue;
            }
            throw error;
        }
    }
    throw ApiError_1.ApiError.serviceUnavailable("Couldn't generate a store code right now. Please try again.");
}
/** Every driver linked to one of this organization's branches, any approval status. */
async function listShopDrivers(organizationId, branchIds) {
    const drivers = await prisma_1.prisma.driver.findMany({
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
    const freshSince = Date.now() - env_1.env.DRIVER_LOCATION_STALE_MINUTES * 60_000;
    return drivers.map((driver) => ({
        id: driver.id,
        fullName: driver.fullName,
        phone: driver.phone,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        status: driver.status,
        joinedAt: driver.shopJoinedAt,
        branch: driver.shopBranch,
        isOnline: driver.isAvailableForAssignment && driver.lastLocationAt != null && driver.lastLocationAt.getTime() >= freshSince,
        isBusy: driver._count.assignedOrders > 0,
    }));
}
/** The shop ends the link; the driver becomes a general NearCart driver. An order they are already
 *  carrying stays with them. `assertAccess` enforces the caller's branch-scoped access. */
async function removeShopDriver(organizationId, driverId, actorUserId, assertAccess) {
    const driver = await prisma_1.prisma.driver.findFirst({
        where: { id: driverId, shopBranch: { organizationId } },
        select: { id: true, shopBranchId: true },
    });
    if (!driver || !driver.shopBranchId) {
        throw ApiError_1.ApiError.notFound("This driver is not one of your shop's drivers");
    }
    assertAccess(driver.shopBranchId);
    const { count } = await prisma_1.prisma.driver.updateMany({
        where: { id: driverId, shopBranchId: driver.shopBranchId },
        data: { shopBranchId: null, shopJoinedAt: null },
    });
    if (count > 0) {
        await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
            organizationId,
            actorUserId,
            action: client_1.AuditAction.DRIVER_SHOP_LEAVE,
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
async function redeemDriverShopCode(tx, driverId, rawCode) {
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
        throw ApiError_1.ApiError.badRequest(INVALID_CODE_MESSAGE);
    }
    const { count } = await tx.driverShopCode.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now, usedByDriverId: driverId },
    });
    if (count === 0) {
        throw ApiError_1.ApiError.badRequest(INVALID_CODE_MESSAGE);
    }
    await tx.driver.update({
        where: { id: driverId },
        data: { shopBranchId: record.branchId, shopJoinedAt: now },
    });
    await (0, audit_service_1.createAuditLog)(tx, {
        organizationId: record.organizationId,
        action: client_1.AuditAction.DRIVER_SHOP_JOIN,
        entityType: "Driver",
        entityId: driverId,
        meta: { branchId: record.branchId },
    });
    return record;
}
async function getDriverShop(driverId) {
    const driver = await prisma_1.prisma.driver.findUnique({
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
async function joinDriverShop(driverId, rawCode) {
    const driver = await prisma_1.prisma.driver.findUnique({
        where: { id: driverId },
        select: {
            status: true,
            shopBranch: { select: { name: true, organization: { select: { name: true } } } },
            _count: { select: { assignedOrders: { where: { status: { in: ACTIVE_ORDER_STATUSES } } } } },
        },
    });
    if (!driver) {
        throw ApiError_1.ApiError.notFound("Driver not found");
    }
    if (driver.shopBranch) {
        throw ApiError_1.ApiError.conflict(`You're already a driver for ${driver.shopBranch.organization.name} (${driver.shopBranch.name}). Leave that shop first.`);
    }
    // Joining narrows which orders they may carry; don't pull that out from under a live delivery.
    if (driver._count.assignedOrders > 0) {
        throw ApiError_1.ApiError.conflict("Finish your current delivery before joining a shop.");
    }
    if (driver.status === client_1.DriverStatus.SUSPENDED) {
        throw ApiError_1.ApiError.forbidden("Your account is suspended.");
    }
    await prisma_1.prisma.$transaction((tx) => redeemDriverShopCode(tx, driverId, rawCode), INTERACTIVE_TRANSACTION_OPTIONS);
    return getDriverShop(driverId);
}
async function leaveDriverShop(driverId) {
    const driver = await prisma_1.prisma.driver.findUnique({
        where: { id: driverId },
        select: { shopBranchId: true, shopBranch: { select: { organizationId: true } } },
    });
    if (!driver?.shopBranchId || !driver.shopBranch) {
        throw ApiError_1.ApiError.badRequest("You're not linked to any shop.");
    }
    await prisma_1.prisma.driver.update({ where: { id: driverId }, data: { shopBranchId: null, shopJoinedAt: null } });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId: driver.shopBranch.organizationId,
        action: client_1.AuditAction.DRIVER_SHOP_LEAVE,
        entityType: "Driver",
        entityId: driverId,
        meta: { branchId: driver.shopBranchId, removedBy: "DRIVER" },
    });
    return { shop: null };
}
