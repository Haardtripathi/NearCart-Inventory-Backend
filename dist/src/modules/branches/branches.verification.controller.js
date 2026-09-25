"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyShopPhotoController = verifyShopPhotoController;
const branchAccess_1 = require("../../utils/branchAccess");
const ApiResponse_1 = require("../../utils/ApiResponse");
const ApiError_1 = require("../../utils/ApiError");
const branches_verification_service_1 = require("./branches.verification.service");
// Bug fixed (this sweep): this route was the one place in the branches module the 2026-08-10
// branch-scoping fix (see branches.controller.ts's header comment) missed — list/get/patch/delete
// all call `assertBranchAccessOrThrow`, but this upload endpoint never did, so a MANAGER limited
// to one branch (`branchAccess: SELECTED`) could still POST a shop-verification photo for, and
// overwrite the verification status of, any OTHER branch in the same org just by passing its id in
// the URL. Confirmed live: a branch-A-scoped MANAGER got a 200 uploading against branch B before
// this fix, and a 403 after it.
async function verifyShopPhotoController(req, res) {
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.params.id);
    if (!req.file) {
        throw ApiError_1.ApiError.badRequest("Photo file is required");
    }
    const data = await (0, branches_verification_service_1.verifyShopPhoto)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, { buffer: req.file.buffer, originalname: req.file.originalname });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Shop photo verification completed", data);
}
