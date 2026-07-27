import { cert, initializeApp, type App } from "firebase-admin/app";

import { env } from "./env";

let initialized = false;
let app: App | null = null;

function isFirebaseConfigured(): boolean {
  return Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
}

/**
 * Lazy, idempotent init — same pattern as ensureCloudinaryConfigured in modules/uploads. Returns
 * null (not a thrown error) when unconfigured so callers no-op with a logged warning instead of
 * crashing before real Firebase credentials exist. Uses firebase-admin v14's modular subpath
 * imports (`firebase-admin/app`) rather than the old `admin.initializeApp`/`admin.credential`
 * namespace API, which firebase-admin no longer exports off its top-level default import.
 */
function getFirebaseApp(): App | null {
  if (!isFirebaseConfigured()) {
    return null;
  }

  if (!initialized) {
    app = initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        // Service-account keys are typically stored with literal "\n" in .env files.
        privateKey: (env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      }),
    });
    initialized = true;
  }

  return app;
}

export { getFirebaseApp, isFirebaseConfigured };
