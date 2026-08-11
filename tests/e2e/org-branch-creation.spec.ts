import { describe, expect, it } from "vitest";
import request from "supertest";

import { app } from "../../src/app";
import { getOrCreateIndustryId, getSuperAdminToken } from "../helpers/auth";
import { uniqueSuffix } from "../helpers/ids";

// Pune — not used for any driver-matching in this file, just a plausible real-world coordinate for
// the geo-branch test below. No collision risk with other spec files' geo-matching scenarios since
// this file never creates a Driver.
const PUNE = { latitude: 18.5204, longitude: 73.8567 };

describe("organization + branch creation", () => {
  it("POST /api/organizations creates an org and a first branch with no coordinates required or accepted", async () => {
    const token = await getSuperAdminToken();
    const industryId = await getOrCreateIndustryId(token);
    const suffix = uniqueSuffix();

    const response = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: `Org Creation Test ${suffix}`,
        primaryIndustryId: industryId,
        firstBranch: {
          name: `Org Creation Test ${suffix} HQ`,
          type: "STORE",
          city: "Testville",
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBeTruthy();
    expect(response.body.data.firstBranch).toBeTruthy();
    expect(response.body.data.firstBranch.name).toBe(`Org Creation Test ${suffix} HQ`);
    // firstBranch never carries coordinates — createOrganizationSchema's branchInputSchema
    // (organizations.validation.ts) has no latitude/longitude fields at all, unlike
    // createBranchSchema below, so there's nothing to even omit here: the request above never
    // offered coordinates, and the created row should reflect that.
    expect(response.body.data.firstBranch.latitude).toBeNull();
    expect(response.body.data.firstBranch.longitude).toBeNull();
  });

  it("silently strips a firstBranch.latitude/longitude field instead of persisting it (field does not exist on that schema)", async () => {
    const token = await getSuperAdminToken();
    const industryId = await getOrCreateIndustryId(token);
    const suffix = uniqueSuffix();

    // Zod schemas in this codebase are not `.strict()` by default, so an unknown `latitude` field
    // is silently stripped rather than rejected — this assertion documents that behavior (the
    // extra field has zero effect) rather than expecting a 400.
    const response = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: `Org Creation Reject Test ${suffix}`,
        primaryIndustryId: industryId,
        firstBranch: {
          name: `Org Creation Reject Test ${suffix} HQ`,
          type: "STORE",
          latitude: 12.9716,
          longitude: 77.5946,
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.data.firstBranch.latitude).toBeNull();
    expect(response.body.data.firstBranch.longitude).toBeNull();
  });

  it("POST /branches accepts latitude/longitude and persists them on a real geo-enabled branch", async () => {
    const token = await getSuperAdminToken();
    const industryId = await getOrCreateIndustryId(token);
    const suffix = uniqueSuffix();

    const orgResponse = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: `Branch Geo Test ${suffix}`,
        primaryIndustryId: industryId,
        firstBranch: { name: `Branch Geo Test ${suffix} HQ`, type: "STORE" },
      });
    expect(orgResponse.status).toBe(201);
    const organizationId = orgResponse.body.data.id as string;

    const branchResponse = await request(app)
      .post("/api/branches")
      .set("Authorization", `Bearer ${token}`)
      .set("x-organization-id", organizationId)
      .send({
        name: `Branch Geo Test ${suffix} Store`,
        type: "STORE",
        latitude: PUNE.latitude,
        longitude: PUNE.longitude,
      });

    expect(branchResponse.status).toBe(201);
    expect(branchResponse.body.data.id).toBeTruthy();
    expect(branchResponse.body.data.latitude).toBeCloseTo(PUNE.latitude, 6);
    expect(branchResponse.body.data.longitude).toBeCloseTo(PUNE.longitude, 6);

    // Round-trip via GET to confirm it's really persisted, not just echoed back in the create
    // response.
    const getResponse = await request(app)
      .get(`/api/branches/${branchResponse.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-organization-id", organizationId);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data.latitude).toBeCloseTo(PUNE.latitude, 6);
    expect(getResponse.body.data.longitude).toBeCloseTo(PUNE.longitude, 6);
  });
});
