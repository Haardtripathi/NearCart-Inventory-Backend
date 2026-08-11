import request from "supertest";

import { app } from "../../src/app";
import { env } from "../../src/config/env";
import { uniqueSuffix } from "./ids";

const SUPER_ADMIN_EMAIL = "e2e-super-admin@nearcart-inventory.test";
const SUPER_ADMIN_PASSWORD = "SuperAdminPass123!";

// Module-scoped cache: helps within a single spec FILE (vitest gives each test file a fresh
// module registry — see vitest.config.ts's isolate default — so this does NOT dedupe the
// bootstrap-or-login round trip across files, only across multiple calls within one file/test).
let cachedToken: string | null = null;

/**
 * Bootstraps the platform's one-and-only SUPER_ADMIN the first time any spec file calls this
 * against the shared test.db, and logs in as that same fixed account on every subsequent call
 * (bootstrap-super-admin conflicts with 409 once a super admin already exists — see
 * auth.service.ts). This is the identity every scenario in this suite uses to create
 * organizations/branches/sales orders and to verify drivers: SUPER_ADMIN can act on any
 * organization by passing `x-organization-id` (see middlewares/org.middleware.ts) without needing
 * a real per-org membership, which is what lets every spec file create its own org from scratch
 * without any shared fixture setup.
 */
export async function getSuperAdminToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken;
  }

  const bootstrapResponse = await request(app).post("/api/auth/bootstrap-super-admin").send({
    secret: env.ADMIN_BOOTSTRAP_SECRET,
    fullName: "E2E Super Admin",
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASSWORD,
  });

  if (bootstrapResponse.status !== 201 && bootstrapResponse.status !== 409) {
    throw new Error(
      `Unexpected bootstrap-super-admin response ${bootstrapResponse.status}: ${JSON.stringify(bootstrapResponse.body)}`,
    );
  }

  const loginResponse = await request(app).post("/api/auth/login").send({
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASSWORD,
  });

  if (loginResponse.status !== 200) {
    throw new Error(
      `Failed to log in as the test super admin: ${loginResponse.status} ${JSON.stringify(loginResponse.body)}`,
    );
  }

  cachedToken = loginResponse.body.data.token as string;
  return cachedToken;
}

/**
 * Returns an existing platform Industry id if one is already in the DB (from an earlier spec file
 * in this same run, or a previous run's leftover state), else creates one. Industries are
 * platform-wide (not org-scoped, `GET /api/platform/industries` is unauthenticated) — reusing one
 * across every spec file avoids creating a fresh Industry (and its transitively-seeded catalog
 * defaults, see organizations.service.ts) per org, which is unnecessary given nothing in this
 * suite asserts anything about industry-specific catalog seeding.
 */
export async function getOrCreateIndustryId(token: string): Promise<string> {
  const listResponse = await request(app).get("/api/platform/industries");

  if (listResponse.status !== 200) {
    throw new Error(`Failed to list industries: ${listResponse.status} ${JSON.stringify(listResponse.body)}`);
  }

  const existing = listResponse.body.data as Array<{ id: string }>;

  if (Array.isArray(existing) && existing.length > 0) {
    return existing[0]!.id;
  }

  const code = `test_industry_${uniqueSuffix()}`;
  const createResponse = await request(app)
    .post("/api/platform/industries")
    .set("Authorization", `Bearer ${token}`)
    .send({
      code,
      name: `Test Industry ${code}`,
      defaultFeatures: {},
    });

  if (createResponse.status !== 201) {
    throw new Error(`Failed to create a test industry: ${createResponse.status} ${JSON.stringify(createResponse.body)}`);
  }

  return createResponse.body.data.id as string;
}
