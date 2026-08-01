import { AuditAction, ShopVerificationStatus } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { createAuditLog } from "../audit/audit.service";
import { uploadImageToCloudinary } from "../uploads/uploads.service";
import { toJsonValue } from "../../utils/json";
import {
  checkPlaceLocationMatch,
  nameSimilarity,
  type PlaceCandidate,
} from "../../services/google-places.service";
import { assessShopPhoto, isReplicateConfigured } from "../../services/replicate.service";

const NAME_MATCH_THRESHOLD = 0.4;

export interface ShopPhotoVerificationResult {
  verified: boolean;
  clarityOk: boolean | null;
  nameDetectedInPhoto: string | null;
  nameMatch: boolean | null;
  placeLocationMatch: boolean;
  matchedPlaceCandidates: PlaceCandidate[];
  photoUrl: string;
  reasons: string[];
}

async function getBranchOrThrow(organizationId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, organizationId, deletedAt: null },
  });

  if (!branch) {
    throw ApiError.notFound("Branch not found");
  }

  return branch;
}

/**
 * POST /branches/:id/verification/photo — compulsory shop-photo verification for shop onboarding.
 *
 * Unlike the driver-verification endpoints (which hard 503 behind requireReplicateConfigured when
 * REPLICATE_API_TOKEN is unset), this endpoint always accepts and stores the photo: onboarding's
 * hard requirement is "a photo was uploaded", not "the photo was AI-verified" (see task spec —
 * don't hard-block onboarding forever just because Replicate isn't configured yet). The Google
 * Places placeLocationMatch check runs independently of Replicate (it only needs
 * GOOGLE_MAPS_API_KEY), so it still executes even in Replicate stub mode. When Replicate later
 * gets a real token, this same endpoint starts returning real clarity/name-match results with zero
 * code changes — the branch is simply left in PENDING_VERIFICATION until an owner re-submits (or a
 * future re-check job calls this again) after that.
 */
export async function verifyShopPhoto(
  organizationId: string,
  branchId: string,
  actorUserId: string,
  file: { buffer: Buffer; originalname: string },
): Promise<ShopPhotoVerificationResult> {
  const branch = await getBranchOrThrow(organizationId, branchId);

  const upload = await uploadImageToCloudinary({
    fileBuffer: file.buffer,
    originalFilename: file.originalname,
    scope: "branch",
    ownerId: organizationId,
  });

  const reasons: string[] = [];
  let clarityOk: boolean | null = null;
  let nameDetectedInPhoto: string | null = null;
  let nameMatch: boolean | null = null;

  const replicateAvailable = isReplicateConfigured();

  if (replicateAvailable) {
    const assessment = await assessShopPhoto(upload.url);
    clarityOk = assessment.clarityOk;
    nameDetectedInPhoto = assessment.nameDetectedInPhoto;
    nameMatch = nameDetectedInPhoto
      ? nameSimilarity(nameDetectedInPhoto, branch.name) >= NAME_MATCH_THRESHOLD
      : false;
    reasons.push(...assessment.reasons);
  } else {
    reasons.push(
      "Automatic photo clarity/name check is not configured yet (REPLICATE_API_TOKEN unset) — photo saved, verification will run automatically once configured",
    );
  }

  let placeLocationMatch = false;
  let matchedPlaceCandidates: PlaceCandidate[] = [];

  if (branch.latitude != null && branch.longitude != null) {
    const placeResult = await checkPlaceLocationMatch({
      name: branch.name,
      latitude: branch.latitude,
      longitude: branch.longitude,
    });
    placeLocationMatch = placeResult.placeLocationMatch;
    matchedPlaceCandidates = placeResult.matchedPlaceCandidates;
    reasons.push(...placeResult.reasons);
  } else {
    reasons.push("Branch has no registered latitude/longitude — location match skipped");
  }

  const verified = replicateAvailable && clarityOk === true && nameMatch === true && placeLocationMatch;
  const status = !replicateAvailable
    ? ShopVerificationStatus.PENDING_VERIFICATION
    : verified
      ? ShopVerificationStatus.VERIFIED
      : ShopVerificationStatus.FLAGGED_MISMATCH;

  await prisma.branch.update({
    where: { id: branch.id },
    data: {
      shopPhotoUrl: upload.url,
      shopPhotoVerificationStatus: status,
      shopPhotoClarityOk: clarityOk,
      shopPhotoNameDetected: nameDetectedInPhoto,
      shopPhotoNameMatch: nameMatch,
      shopPhotoPlaceLocationMatch: placeLocationMatch,
      shopPhotoMatchedPlaces: toJsonValue(matchedPlaceCandidates),
      shopPhotoVerificationReasons: toJsonValue(reasons),
      shopPhotoVerifiedAt: new Date(),
    },
  });

  await createAuditLog(prisma, {
    organizationId,
    actorUserId,
    action: AuditAction.SHOP_PHOTO_VERIFY,
    entityType: "Branch",
    entityId: branch.id,
    after: { status, verified, photoUrl: upload.url },
    meta: { replicateAvailable },
  });

  return {
    verified,
    clarityOk,
    nameDetectedInPhoto,
    nameMatch,
    placeLocationMatch,
    matchedPlaceCandidates,
    photoUrl: upload.url,
    reasons,
  };
}
