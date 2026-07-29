"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFirebaseApp = getFirebaseApp;
exports.isFirebaseConfigured = isFirebaseConfigured;
const app_1 = require("firebase-admin/app");
const env_1 = require("./env");
let initialized = false;
let app = null;
function isFirebaseConfigured() {
    return Boolean(env_1.env.FIREBASE_PROJECT_ID && env_1.env.FIREBASE_CLIENT_EMAIL && env_1.env.FIREBASE_PRIVATE_KEY);
}
/**
 * Lazy, idempotent init — same pattern as ensureCloudinaryConfigured in modules/uploads. Returns
 * null (not a thrown error) when unconfigured so callers no-op with a logged warning instead of
 * crashing before real Firebase credentials exist. Uses firebase-admin v14's modular subpath
 * imports (`firebase-admin/app`) rather than the old `admin.initializeApp`/`admin.credential`
 * namespace API, which firebase-admin no longer exports off its top-level default import.
 */
function getFirebaseApp() {
    if (!isFirebaseConfigured()) {
        return null;
    }
    if (!initialized) {
        app = (0, app_1.initializeApp)({
            credential: (0, app_1.cert)({
                projectId: env_1.env.FIREBASE_PROJECT_ID,
                clientEmail: env_1.env.FIREBASE_CLIENT_EMAIL,
                // Service-account keys are typically stored with literal "\n" in .env files.
                privateKey: (env_1.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
            }),
        });
        initialized = true;
    }
    return app;
}
