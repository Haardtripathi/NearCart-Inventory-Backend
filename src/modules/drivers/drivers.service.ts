import { DriverStatus, SalesOrderStatus } from "@prisma/client";

import { env } from "../../config/env";
import { prisma } from "../../config/prisma";

/**
 * Org-staff-facing driver directory for the assign-driver dropdown (see sales-orders module's
 * assign-driver endpoint). Drivers are a platform-wide pool — any shop's staff can see/assign any
 * verified driver — so this intentionally returns only the minimal fields locked in
 * PHASE1_REQUIREMENTS.md's contract, not the full Driver record (no email/vehicleNumber/etc).
 */
export async function listAssignableDrivers(
  query: { status?: DriverStatus; branchId?: string },
  organizationId?: string,
) {
  const drivers = await prisma.driver.findMany({
    where: {
      status: query.status ?? DriverStatus.VERIFIED,
    },
    select: {
      id: true,
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
            where: { status: { in: [SalesOrderStatus.READY, SalesOrderStatus.OUT_FOR_DELIVERY] } },
          },
        },
      },
    },
    orderBy: { fullName: "asc" },
  });

  // Branch is looked up inside the caller's organization only — a foreign branchId just means
  // "no distance", never another org's coordinates.
  const branch =
    query.branchId && organizationId
      ? await prisma.branch.findFirst({
          where: { id: query.branchId, organizationId },
          select: { latitude: true, longitude: true },
        })
      : null;

  const freshSince = Date.now() - env.DRIVER_LOCATION_STALE_MINUTES * 60_000;

  const items = drivers.map((driver) => {
    const hasFreshLocation =
      driver.lastLocationAt != null &&
      driver.lastLocationAt.getTime() >= freshSince &&
      driver.lastKnownLatitude != null &&
      driver.lastKnownLongitude != null;
    const distanceKm =
      hasFreshLocation && branch?.latitude != null && branch.longitude != null
        ? Number(
            haversineKm(
              branch.latitude,
              branch.longitude,
              driver.lastKnownLatitude as number,
              driver.lastKnownLongitude as number,
            ).toFixed(1),
          )
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
      distanceKm,
    };
  });

  const rank = (item: (typeof items)[number]) => (item.isOnline && !item.isBusy ? 0 : item.isOnline ? 1 : 2);

  return items.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) ||
      a.fullName.localeCompare(b.fullName),
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
