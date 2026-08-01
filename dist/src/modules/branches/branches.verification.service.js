"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyShopPhoto = verifyShopPhoto;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const audit_service_1 = require("../audit/audit.service");
const uploads_service_1 = require("../uploads/uploads.service");
const json_1 = require("../../utils/json");
const google_places_service_1 = require("../../services/google-places.service");
const replicate_service_1 = require("../../services/replicate.service");
const NAME_MATCH_THRESHOLD = 0.4;
async function getBranchOrThrow(organizationId, branchId) {
    const branch = await prisma_1.prisma.branch.findFirst({
        where: { id: branchId, organizationId, deletedAt: null },
    });
    if (!branch) {
        throw ApiError_1.ApiError.notFound("Branch not found");
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
async function verifyShopPhoto(organizationId, branchId, actorUserId, file) {
    const branch = await getBranchOrThrow(organizationId, branchId);
    const upload = await (0, uploads_service_1.uploadImageToCloudinary)({
        fileBuffer: file.buffer,
        originalFilename: file.originalname,
        scope: "branch",
        ownerId: organizationId,
    });
    const reasons = [];
    let clarityOk = null;
    let nameDetectedInPhoto = null;
    let nameMatch = null;
    const replicateAvailable = (0, replicate_service_1.isReplicateConfigured)();
    if (replicateAvailable) {
        const assessment = await (0, replicate_service_1.assessShopPhoto)(upload.url);
        clarityOk = assessment.clarityOk;
        nameDetectedInPhoto = assessment.nameDetectedInPhoto;
        nameMatch = nameDetectedInPhoto
            ? (0, google_places_service_1.nameSimilarity)(nameDetectedInPhoto, branch.name) >= NAME_MATCH_THRESHOLD
            : false;
        reasons.push(...assessment.reasons);
    }
    else {
        reasons.push("Automatic photo clarity/name check is not configured yet (REPLICATE_API_TOKEN unset) — photo saved, verification will run automatically once configured");
    }
    let placeLocationMatch = false;
    let matchedPlaceCandidates = [];
    if (branch.latitude != null && branch.longitude != null) {
        const placeResult = await (0, google_places_service_1.checkPlaceLocationMatch)({
            name: branch.name,
            latitude: branch.latitude,
            longitude: branch.longitude,
        });
        placeLocationMatch = placeResult.placeLocationMatch;
        matchedPlaceCandidates = placeResult.matchedPlaceCandidates;
        reasons.push(...placeResult.reasons);
    }
    else {
        reasons.push("Branch has no registered latitude/longitude — location match skipped");
    }
    const verified = replicateAvailable && clarityOk === true && nameMatch === true && placeLocationMatch;
    const status = !replicateAvailable
        ? client_1.ShopVerificationStatus.PENDING_VERIFICATION
        : verified
            ? client_1.ShopVerificationStatus.VERIFIED
            : client_1.ShopVerificationStatus.FLAGGED_MISMATCH;
    await prisma_1.prisma.branch.update({
        where: { id: branch.id },
        data: {
            shopPhotoUrl: upload.url,
            shopPhotoVerificationStatus: status,
            shopPhotoClarityOk: clarityOk,
            shopPhotoNameDetected: nameDetectedInPhoto,
            shopPhotoNameMatch: nameMatch,
            shopPhotoPlaceLocationMatch: placeLocationMatch,
            shopPhotoMatchedPlaces: (0, json_1.toJsonValue)(matchedPlaceCandidates),
            shopPhotoVerificationReasons: (0, json_1.toJsonValue)(reasons),
            shopPhotoVerifiedAt: new Date(),
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.SHOP_PHOTO_VERIFY,
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
