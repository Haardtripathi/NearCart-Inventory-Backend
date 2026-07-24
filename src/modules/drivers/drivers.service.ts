import { DriverStatus } from "@prisma/client";

import { prisma } from "../../config/prisma";

/**
 * Org-staff-facing driver directory for the assign-driver dropdown (see sales-orders module's
 * assign-driver endpoint). Drivers are a platform-wide pool — any shop's staff can see/assign any
 * verified driver — so this intentionally returns only the minimal fields locked in
 * PHASE1_REQUIREMENTS.md's contract, not the full Driver record (no email/vehicleNumber/etc).
 */
export async function listAssignableDrivers(query: { status?: DriverStatus }) {
  const drivers = await prisma.driver.findMany({
    where: {
      status: query.status ?? DriverStatus.VERIFIED,
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      vehicleType: true,
    },
    orderBy: { fullName: "asc" },
  });

  return drivers;
}
