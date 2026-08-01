"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireReplicateConfigured = requireReplicateConfigured;
const replicate_service_1 = require("../services/replicate.service");
/**
 * Gate for every Replicate-backed verification endpoint (shop-photo, driver vehicle-photo,
 * driver license/license-confirm). Responds with the exact `503 { error: "verification_unavailable" }`
 * shape specified by the shop/driver-verification task spec — deliberately NOT this backend's
 * normal `{success,message,errors}` ApiError envelope, mirroring the precedent in
 * driver-auth.service.ts's `DriverStatusError` (a locked external API contract takes priority
 * over internal envelope consistency). Placed before multer in the route chain so an
 * unconfigured server rejects fast without even parsing the multipart upload.
 */
function requireReplicateConfigured(_req, res, next) {
    if (!(0, replicate_service_1.isReplicateConfigured)()) {
        return res.status(503).json({ error: "verification_unavailable" });
    }
    next();
}
