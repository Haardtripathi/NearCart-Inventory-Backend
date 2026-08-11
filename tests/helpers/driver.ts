import request from "supertest";

import { app } from "../../src/app";
import { uniqueSuffix } from "./ids";

export interface TestDriver {
  driverId: string;
  token: string;
}

/**
 * Full register -> admin-verify -> login -> location -> availability pipeline for a single
 * driver, parameterized by lat/lng so callers can place drivers at controlled coordinates for
 * matching/radius tests. Deliberately skips the driver email-OTP flow entirely: `loginDriver`
 * (driver-auth.service.ts) only ever checks `Driver.status` (PENDING_VERIFICATION/VERIFIED/
 * SUSPENDED), never `emailVerified` — OTP verification is an independent, additive trust signal,
 * not a login precondition (see the design-decision comment on sendDriverEmailVerificationOtp) —
 * so a driver becomes loginable purely via the admin verify endpoint below, with no Redis/OTP
 * infra needed in this test environment at all.
 */
export async function setupVerifiedDriver(
  superAdminToken: string,
  opts: { latitude: number; longitude: number; available?: boolean },
): Promise<TestDriver> {
  const suffix = uniqueSuffix();
  const phone = `+1555${suffix}`;
  const password = "DriverPass123!";

  const registerResponse = await request(app).post("/api/driver-auth/register").send({
    fullName: `Test Driver ${suffix}`,
    phone,
    email: `driver-${suffix}@nearcart-inventory.test`,
    password,
    vehicleType: "bike",
    vehicleNumber: `KA-TEST-${suffix}`,
  });

  if (registerResponse.status !== 201) {
    throw new Error(`Failed to register test driver: ${registerResponse.status} ${JSON.stringify(registerResponse.body)}`);
  }

  const driverId = registerResponse.body.driver.id as string;

  const verifyResponse = await request(app)
    .patch(`/api/platform/drivers/${driverId}/verify`)
    .set("Authorization", `Bearer ${superAdminToken}`);

  if (verifyResponse.status !== 200) {
    throw new Error(`Failed to verify test driver ${driverId}: ${verifyResponse.status} ${JSON.stringify(verifyResponse.body)}`);
  }

  const loginResponse = await request(app).post("/api/driver-auth/login").send({ phone, password });

  if (loginResponse.status !== 200) {
    throw new Error(`Failed to log in test driver ${driverId}: ${loginResponse.status} ${JSON.stringify(loginResponse.body)}`);
  }

  const token = loginResponse.body.token as string;

  const locationResponse = await request(app)
    .patch("/api/driver/location")
    .set("Authorization", `Bearer ${token}`)
    .send({ latitude: opts.latitude, longitude: opts.longitude });

  if (locationResponse.status !== 200) {
    throw new Error(`Failed to set location for test driver ${driverId}: ${locationResponse.status} ${JSON.stringify(locationResponse.body)}`);
  }

  const availabilityResponse = await request(app)
    .patch("/api/driver/availability")
    .set("Authorization", `Bearer ${token}`)
    .send({ isAvailableForAssignment: opts.available ?? true });

  if (availabilityResponse.status !== 200) {
    throw new Error(`Failed to set availability for test driver ${driverId}: ${availabilityResponse.status} ${JSON.stringify(availabilityResponse.body)}`);
  }

  return { driverId, token };
}

export async function setDriverAvailability(driverToken: string, isAvailableForAssignment: boolean) {
  const response = await request(app)
    .patch("/api/driver/availability")
    .set("Authorization", `Bearer ${driverToken}`)
    .send({ isAvailableForAssignment });

  if (response.status !== 200) {
    throw new Error(`Failed to update driver availability: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body.data;
}
