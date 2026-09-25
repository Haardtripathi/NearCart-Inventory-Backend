"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAssignableDrivers = listAssignableDrivers;
const client_1 = require("@prisma/client");
const env_1 = require("../../config/env");
const prisma_1 = require("../../config/prisma");
/**
 * Org-staff-facing driver directory for the assign-driver dropdown (see sales-orders module's
 * assign-driver endpoint). Drivers are a platform-wide pool — any shop's staff can see/assign any
 * verified driver — so this intentionally returns only the minimal fields locked in
 * PHASE1_REQUIREMENTS.md's contract, not the full Driver record (no email/vehicleNumber/etc).
 */
async function listAssignableDrivers(query, organizationId) {
    // Shop-owned drivers (2026-09-24) belong to one branch: they're listed for that branch only —
    // never for another shop — and `shopOnly` narrows to them (the "My own driver" picker).
    const shopFilter = query.shopOnly
        ? { shopBranchId: query.branchId ?? "__none__" }
        : query.branchId
            ? { OR: [{ shopBranchId: null }, { shopBranchId: query.branchId }] }
            : { OR: [{ shopBranchId: null }, { shopBranch: { organizationId } }] };
    const drivers = await prisma_1.prisma.driver.findMany({
        where: {
            status: query.status ?? client_1.DriverStatus.VERIFIED,
            ...shopFilter,
        },
        select: {
            id: true,
            shopBranchId: true,
            fullName: true,
            phone: true,
            vehicleType: true,
            isAvailableForAssignment: true,
            lastKnownLatitude: true,
            lastKnownLongitude: true,
            lastLocationAt: true,
            // "Busy" = already carrying a delivery (same definition auto-assignment uses).
            _count: {
                select: {
                    assignedOrders: {
                        where: { status: { in: [client_1.SalesOrderStatus.READY, client_1.SalesOrderStatus.OUT_FOR_DELIVERY] } },
                    },
                },
            },
        },
        orderBy: { fullName: "asc" },
    });
    // Branch is looked up inside the caller's organization only — a foreign branchId just means
    // "no distance", never another org's coordinates.
    const branch = query.branchId && organizationId
        ? await prisma_1.prisma.branch.findFirst({
            where: { id: query.branchId, organizationId },
            select: { latitude: true, longitude: true },
        })
        : null;
    const freshSince = Date.now() - env_1.env.DRIVER_LOCATION_STALE_MINUTES * 60_000;
    const items = drivers.map((driver) => {
        const hasFreshLocation = driver.lastLocationAt != null &&
            driver.lastLocationAt.getTime() >= freshSince &&
            driver.lastKnownLatitude != null &&
            driver.lastKnownLongitude != null;
        const distanceKm = hasFreshLocation && branch?.latitude != null && branch.longitude != null
            ? Number(haversineKm(branch.latitude, branch.longitude, driver.lastKnownLatitude, driver.lastKnownLongitude).toFixed(1))
            : null;
        return {
            id: driver.id,
            fullName: driver.fullName,
            phone: driver.phone,
            vehicleType: driver.vehicleType,
            // Added 2026-09-20 for the shop's manual "Assign driver" sheet, which listed every verified
            // driver A–Z with no hint of who could actually take the order. Deliberately coarse: a
            // distance in km, never raw coordinates (same privacy stance as the rest of this endpoint).
            isOnline: driver.isAvailableForAssignment && hasFreshLocation,
            isBusy: driver._count.assignedOrders > 0,
            isShopDriver: driver.shopBranchId != null,
            distanceKm,
        };
    });
    const rank = (item) => (item.isOnline && !item.isBusy ? 0 : item.isOnline ? 1 : 2);
    return items.sort((a, b) => rank(a) - rank(b) ||
        (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) ||
        a.fullName.localeCompare(b.fullName));
}
function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
