"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAssignableDrivers = listAssignableDrivers;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
/**
 * Org-staff-facing driver directory for the assign-driver dropdown (see sales-orders module's
 * assign-driver endpoint). Drivers are a platform-wide pool — any shop's staff can see/assign any
 * verified driver — so this intentionally returns only the minimal fields locked in
 * PHASE1_REQUIREMENTS.md's contract, not the full Driver record (no email/vehicleNumber/etc).
 */
async function listAssignableDrivers(query) {
    const drivers = await prisma_1.prisma.driver.findMany({
        where: {
            status: query.status ?? client_1.DriverStatus.VERIFIED,
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
