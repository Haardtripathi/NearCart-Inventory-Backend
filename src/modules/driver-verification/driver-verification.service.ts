import { AuditAction, DriverVerificationStatus } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { createAuditLog } from "../audit/audit.service";
import { uploadImageToCloudinary } from "../uploads/uploads.service";
import { nameSimilarity } from "../../services/google-places.service";
import { assessVehiclePhoto, extractLicenseFields } from "../../services/replicate.service";

function normalizeForCompare(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function getDriverOrThrow(driverId: string) {
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) {
    throw ApiError.notFound("Driver not found");
  }
  return driver;
}

export interface DriverVerificationStatusResult {
  vehicleType: string;
  vehicleNumber: string;
  vehiclePhotoUrl: string | null;
  vehiclePlateNumber: string | null;
  vehiclePlateVerified: boolean;
  vehiclePhotoClarityOk: boolean | null;
  licensePhotoUrl: string | null;
  licenseNumber: string | null;
  licenseHolderName: string | null;
  licenseDob: string | null;
  licenseExpiry: string | null;
  licenseVerified: boolean;
  licenseMatchScore: number | null;
  onboardingVerificationStatus: DriverVerificationStatus;
}

/**
 * GET /driver/verification/status — read-only snapshot of everything the onboarding vehicle/
 * license steps (VehiclePhotoStep/LicenseVerificationStep) have written to this driver's record so
 * far. Added for the driver app's "Documents" screen (Round 2 UI overhaul) so a driver can review
 * what's on file and re-verify a document post-onboarding without re-running the whole onboarding
 * flow — reuses the exact same upload/verify endpoints below, this just adds the missing "what do
 * I currently have on file" read.
 */
export async function getDriverVerificationStatus(driverId: string): Promise<DriverVerificationStatusResult> {
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

export interface VehiclePhotoVerificationResult {
  verified: boolean;
  clarityOk: boolean;
  plateDetected: boolean;
  plateText: string | null;
  photoUrl: string;
  reasons: string[];
}

/** POST /driver/verification/vehicle-photo — gated by requireReplicateConfigured upstream. */
export async function verifyDriverVehiclePhoto(
  driverId: string,
  file: { buffer: Buffer; originalname: string },
): Promise<VehiclePhotoVerificationResult> {
  const driver = await getDriverOrThrow(driverId);

  const upload = await uploadImageToCloudinary({
    fileBuffer: file.buffer,
    originalFilename: file.originalname,
    scope: "general",
    ownerId: `driver-${driverId}`,
  });

  const assessment = await assessVehiclePhoto(upload.url);
  const verified = assessment.clarityOk && assessment.plateDetected;

  const onboardingVerificationStatus =
    verified && driver.licenseVerified
      ? DriverVerificationStatus.VERIFIED
      : verified
        ? DriverVerificationStatus.PENDING_VERIFICATION
        : DriverVerificationStatus.FLAGGED_MISMATCH;

  await prisma.driver.update({
    where: { id: driverId },
    data: {
      vehiclePhotoUrl: upload.url,
      vehiclePlateNumber: assessment.plateText,
      vehiclePlateVerified: verified,
      vehiclePhotoClarityOk: assessment.clarityOk,
      onboardingVerificationStatus,
    },
  });

  await createAuditLog(prisma, {
    action: AuditAction.DRIVER_VEHICLE_VERIFY,
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

export interface LicenseOcrResponse {
  extracted: {
    name: string | null;
    licenseNumber: string | null;
    dob: string | null;
    expiry: string | null;
  };
  clarityOk: boolean;
  photoUrl: string;
  reasons: string[];
}

/**
 * POST /driver/verification/license — gated by requireReplicateConfigured upstream. Uploads the
 * photo and runs OCR only; deliberately does NOT persist licenseVerified/onboardingVerificationStatus
 * here (see driver-verification.route.ts comment) — that only happens once the driver reviews/
 * corrects the autofilled form and calls /license/confirm below with the final values.
 */
export async function ocrDriverLicense(
  driverId: string,
  file: { buffer: Buffer; originalname: string },
): Promise<LicenseOcrResponse> {
  await getDriverOrThrow(driverId);

  const upload = await uploadImageToCloudinary({
    fileBuffer: file.buffer,
    originalFilename: file.originalname,
    scope: "general",
    ownerId: `driver-${driverId}`,
  });

  const ocr = await extractLicenseFields(upload.url);

  // Store the photo URL immediately (so it survives even if the driver abandons the flow before
  // confirming) but leave licenseVerified/licenseNumber/etc. untouched until /license/confirm —
  // those are the "possibly user-edited" final values, not this raw OCR read.
  await prisma.driver.update({
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

export interface ConfirmLicenseResult {
  verified: boolean;
  matchScore: number;
  mismatches: string[];
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
 * POST /driver/verification/license/confirm — gated by requireReplicateConfigured upstream (the
 * re-verification step still needs a fresh OCR pass to compare against). Re-runs OCR on the same
 * photoUrl the driver is confirming against, diffs it field-by-field against the (possibly
 * corrected) submitted values, and persists the final result.
 */
export async function confirmDriverLicense(
  driverId: string,
  input: { name: string; licenseNumber: string; dob: string; expiry: string; photoUrl: string },
): Promise<ConfirmLicenseResult> {
  const driver = await getDriverOrThrow(driverId);

  const ocr = await extractLicenseFields(input.photoUrl);

  const fieldChecks: Array<{ field: string; matches: boolean }> = [
    {
      field: "name",
      matches: nameSimilarity(input.name, ocr.extracted.name ?? "") >= 0.5,
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

  const onboardingVerificationStatus =
    verified && driver.vehiclePlateVerified
      ? DriverVerificationStatus.VERIFIED
      : verified
        ? DriverVerificationStatus.PENDING_VERIFICATION
        : DriverVerificationStatus.FLAGGED_MISMATCH;

  await prisma.driver.update({
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

  await createAuditLog(prisma, {
    action: AuditAction.DRIVER_LICENSE_VERIFY,
    entityType: "Driver",
    entityId: driverId,
    after: { verified, matchScore, mismatches, onboardingVerificationStatus },
    meta: { driverId },
  });

  return { verified, matchScore, mismatches };
}
