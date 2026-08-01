"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyDriverVehiclePhoto = verifyDriverVehiclePhoto;
exports.ocrDriverLicense = ocrDriverLicense;
exports.confirmDriverLicense = confirmDriverLicense;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const audit_service_1 = require("../audit/audit.service");
const uploads_service_1 = require("../uploads/uploads.service");
const google_places_service_1 = require("../../services/google-places.service");
const replicate_service_1 = require("../../services/replicate.service");
function normalizeForCompare(value) {
    return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
async function getDriverOrThrow(driverId) {
    const driver = await prisma_1.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
        throw ApiError_1.ApiError.notFound("Driver not found");
    }
    return driver;
}
/** POST /driver/verification/vehicle-photo — gated by requireReplicateConfigured upstream. */
async function verifyDriverVehiclePhoto(driverId, file) {
    const driver = await getDriverOrThrow(driverId);
    const upload = await (0, uploads_service_1.uploadImageToCloudinary)({
        fileBuffer: file.buffer,
        originalFilename: file.originalname,
        scope: "general",
        ownerId: `driver-${driverId}`,
    });
    const assessment = await (0, replicate_service_1.assessVehiclePhoto)(upload.url);
    const verified = assessment.clarityOk && assessment.plateDetected;
    const onboardingVerificationStatus = verified && driver.licenseVerified
        ? client_1.DriverVerificationStatus.VERIFIED
        : verified
            ? client_1.DriverVerificationStatus.PENDING_VERIFICATION
            : client_1.DriverVerificationStatus.FLAGGED_MISMATCH;
    await prisma_1.prisma.driver.update({
        where: { id: driverId },
        data: {
            vehiclePhotoUrl: upload.url,
            vehiclePlateNumber: assessment.plateText,
            vehiclePlateVerified: verified,
            vehiclePhotoClarityOk: assessment.clarityOk,
            onboardingVerificationStatus,
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        action: client_1.AuditAction.DRIVER_VEHICLE_VERIFY,
        entityType: "Driver",
        entityId: driverId,
        after: { verified, plateText: assessment.plateText, onboardingVerificationStatus },
        meta: { driverId },
    });
    return {
        verified,
        clarityOk: assessment.clarityOk,
        plateDetected: assessment.plateDetected,
        plateText: assessment.plateText,
        photoUrl: upload.url,
        reasons: assessment.reasons,
    };
}
/**
 * POST /driver/verification/license — gated by requireReplicateConfigured upstream. Uploads the
 * photo and runs OCR only; deliberately does NOT persist licenseVerified/onboardingVerificationStatus
 * here (see driver-verification.route.ts comment) — that only happens once the driver reviews/
 * corrects the autofilled form and calls /license/confirm below with the final values.
 */
async function ocrDriverLicense(driverId, file) {
    await getDriverOrThrow(driverId);
    const upload = await (0, uploads_service_1.uploadImageToCloudinary)({
        fileBuffer: file.buffer,
        originalFilename: file.originalname,
        scope: "general",
        ownerId: `driver-${driverId}`,
    });
    const ocr = await (0, replicate_service_1.extractLicenseFields)(upload.url);
    // Store the photo URL immediately (so it survives even if the driver abandons the flow before
    // confirming) but leave licenseVerified/licenseNumber/etc. untouched until /license/confirm —
    // those are the "possibly user-edited" final values, not this raw OCR read.
    await prisma_1.prisma.driver.update({
        where: { id: driverId },
        data: { licensePhotoUrl: upload.url },
    });
    return {
        extracted: ocr.extracted,
        clarityOk: ocr.clarityOk,
        photoUrl: upload.url,
        reasons: ocr.reasons,
    };
}
const MATCH_SCORE_VERIFIED_THRESHOLD = 0.75;
/**
 * POST /driver/verification/license/confirm — gated by requireReplicateConfigured upstream (the
 * re-verification step still needs a fresh OCR pass to compare against). Re-runs OCR on the same
 * photoUrl the driver is confirming against, diffs it field-by-field against the (possibly
 * corrected) submitted values, and persists the final result.
 */
async function confirmDriverLicense(driverId, input) {
    const driver = await getDriverOrThrow(driverId);
    const ocr = await (0, replicate_service_1.extractLicenseFields)(input.photoUrl);
    const fieldChecks = [
        {
            field: "name",
            matches: (0, google_places_service_1.nameSimilarity)(input.name, ocr.extracted.name ?? "") >= 0.5,
        },
        {
            field: "licenseNumber",
            matches: normalizeForCompare(input.licenseNumber) === normalizeForCompare(ocr.extracted.licenseNumber),
        },
        {
            field: "dob",
            matches: normalizeForCompare(input.dob) === normalizeForCompare(ocr.extracted.dob),
        },
        {
            field: "expiry",
            matches: normalizeForCompare(input.expiry) === normalizeForCompare(ocr.extracted.expiry),
        },
    ];
    const mismatches = fieldChecks.filter((check) => !check.matches).map((check) => check.field);
    const matchScore = (fieldChecks.length - mismatches.length) / fieldChecks.length;
    const verified = ocr.clarityOk && matchScore >= MATCH_SCORE_VERIFIED_THRESHOLD;
    const onboardingVerificationStatus = verified && driver.vehiclePlateVerified
        ? client_1.DriverVerificationStatus.VERIFIED
        : verified
            ? client_1.DriverVerificationStatus.PENDING_VERIFICATION
            : client_1.DriverVerificationStatus.FLAGGED_MISMATCH;
    await prisma_1.prisma.driver.update({
        where: { id: driverId },
        data: {
            licensePhotoUrl: input.photoUrl,
            licenseNumber: input.licenseNumber,
            licenseHolderName: input.name,
            licenseDob: input.dob,
            licenseExpiry: input.expiry,
            licenseVerified: verified,
            licenseMatchScore: matchScore,
            onboardingVerificationStatus,
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        action: client_1.AuditAction.DRIVER_LICENSE_VERIFY,
        entityType: "Driver",
        entityId: driverId,
        after: { verified, matchScore, mismatches, onboardingVerificationStatus },
        meta: { driverId },
    });
    return { verified, matchScore, mismatches };
}
