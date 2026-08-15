"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDriverVerificationStatus = getDriverVerificationStatus;
exports.verifyDriverVehiclePhoto = verifyDriverVehiclePhoto;
exports.ocrDriverLicense = ocrDriverLicense;
exports.confirmDriverLicense = confirmDriverLicense;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const redis_1 = require("../../config/redis");
const ApiError_1 = require("../../utils/ApiError");
const audit_service_1 = require("../audit/audit.service");
const uploads_service_1 = require("../uploads/uploads.service");
const google_places_service_1 = require("../../services/google-places.service");
const replicate_service_1 = require("../../services/replicate.service");
function normalizeForCompare(value) {
    return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
// Vision-model OCR reads are not perfectly deterministic — two independent calls on the exact
// same license photo can disagree on a field (confirmed live: dob/licenseNumber differed across
// consecutive calls on the same test image). Re-running OCR from scratch in /license/confirm to
// diff against it meant a driver could submit exactly what /license told them and still get
// spuriously FLAGGED_MISMATCH from the *second* call's different reading. Fix: cache the first
// call's extraction in Redis (short TTL, one-time use, keyed by driver+photoUrl so a stale/
// mismatched cache entry is never used) and diff /confirm against that instead of a fresh call.
// This doesn't weaken the identity check — it's still a genuine independent extraction from the
// real photo, just the first one instead of a flakier second one — and it saves a Replicate call.
// Redis is optional infra here (unlike OTP codes, which fail closed without it): if it's
// unavailable or the cache entry is missing/expired/mismatched, /confirm falls back to running
// OCR fresh, exactly like before this fix.
const LICENSE_OCR_DRAFT_TTL_SECONDS = 30 * 60;
function licenseOcrDraftKey(driverId) {
    return `driver-license-ocr-draft:${driverId}`;
}
async function cacheLicenseOcrDraft(driverId, draft) {
    const redis = (0, redis_1.getRedisClient)();
    if (!redis)
        return;
    await redis.set(licenseOcrDraftKey(driverId), JSON.stringify(draft), "EX", LICENSE_OCR_DRAFT_TTL_SECONDS);
}
/** Returns the cached first-pass OCR draft only if it matches the photo being confirmed; consumes it (one-time use) either way it's found. */
async function takeLicenseOcrDraft(driverId, photoUrl) {
    const redis = (0, redis_1.getRedisClient)();
    if (!redis)
        return null;
    const key = licenseOcrDraftKey(driverId);
    const raw = await redis.get(key);
    if (!raw)
        return null;
    await redis.del(key);
    try {
        const draft = JSON.parse(raw);
        return draft.photoUrl === photoUrl ? draft : null;
    }
    catch {
        return null;
    }
}
async function getDriverOrThrow(driverId) {
    const driver = await prisma_1.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
        throw ApiError_1.ApiError.notFound("Driver not found");
    }
    return driver;
}
/**
 * GET /driver/verification/status — read-only snapshot of everything the onboarding vehicle/
 * license steps (VehiclePhotoStep/LicenseVerificationStep) have written to this driver's record so
 * far. Added for the driver app's "Documents" screen (Round 2 UI overhaul) so a driver can review
 * what's on file and re-verify a document post-onboarding without re-running the whole onboarding
 * flow — reuses the exact same upload/verify endpoints below, this just adds the missing "what do
 * I currently have on file" read.
 */
async function getDriverVerificationStatus(driverId) {
    const driver = await getDriverOrThrow(driverId);
    return {
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        vehiclePhotoUrl: driver.vehiclePhotoUrl,
        vehiclePlateNumber: driver.vehiclePlateNumber,
        vehiclePlateVerified: driver.vehiclePlateVerified,
        vehiclePhotoClarityOk: driver.vehiclePhotoClarityOk,
        licensePhotoUrl: driver.licensePhotoUrl,
        licenseNumber: driver.licenseNumber,
        licenseHolderName: driver.licenseHolderName,
        licenseDob: driver.licenseDob,
        licenseExpiry: driver.licenseExpiry,
        licenseVerified: driver.licenseVerified,
        licenseMatchScore: driver.licenseMatchScore,
        onboardingVerificationStatus: driver.onboardingVerificationStatus,
    };
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
    // Cache this extraction so /license/confirm can diff against it instead of re-running OCR
    // (which isn't deterministic across calls — see LICENSE_OCR_DRAFT_TTL_SECONDS comment above).
    await cacheLicenseOcrDraft(driverId, { photoUrl: upload.url, extracted: ocr.extracted, clarityOk: ocr.clarityOk });
    return {
        extracted: ocr.extracted,
        clarityOk: ocr.clarityOk,
        photoUrl: upload.url,
        reasons: ocr.reasons,
    };
}
const MATCH_SCORE_VERIFIED_THRESHOLD = 0.75;
// name + licenseNumber are the two fields that actually identify *this* license as belonging to
// *this* driver — dob/expiry matching too is good corroborating signal but must never be enough
// on its own to offset a wrong name or license number. Without this, 3-of-4 fields matching
// (score 0.75, clearing the threshold above) would let a wrong name through as long as license
// number/dob/expiry happened to match, which defeats the point of identity verification. Confirmed
// live 2026-08-02: before this fix, submitting a fabricated name against someone else's real
// license photo (correct number/dob/expiry) returned verified:true.
const REQUIRED_MATCH_FIELDS = ["name", "licenseNumber"];
/**
 * POST /driver/verification/license/confirm — gated by requireReplicateConfigured upstream.
 * Diffs the (possibly corrected) submitted values field-by-field against an independent OCR
 * extraction of the same photo, and persists the final result. Prefers the extraction already
 * cached from the driver's own /license call (see takeLicenseOcrDraft above) over running OCR
 * again — a second fresh call on the same image isn't guaranteed to agree with the first
 * (vision-model nondeterminism), which previously could flag a truthful resubmission as a
 * mismatch. Falls back to a fresh OCR call if no matching cached draft exists (expired, Redis
 * unavailable, or the driver is confirming a different photoUrl than they last ran /license on).
 */
async function confirmDriverLicense(driverId, input) {
    const driver = await getDriverOrThrow(driverId);
    const cachedDraft = await takeLicenseOcrDraft(driverId, input.photoUrl);
    const ocr = cachedDraft ?? (await (0, replicate_service_1.extractLicenseFields)(input.photoUrl));
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
    const requiredFieldsMatch = REQUIRED_MATCH_FIELDS.every((field) => !mismatches.includes(field));
    const verified = ocr.clarityOk && requiredFieldsMatch && matchScore >= MATCH_SCORE_VERIFIED_THRESHOLD;
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
