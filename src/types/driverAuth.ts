export interface DriverJwtPayload {
  driverId: string;
  type: "driver";
}

// Distinct `type` discriminator (not just a shorter-lived "driver" token) so this can never be
// accepted by `verifyDriverAuthToken`/`authenticateDriver` — it authenticates a narrower surface
// (see driverVerificationAuth.middleware.ts) for a driver who cannot log in normally yet.
export interface DriverVerificationPendingJwtPayload {
  driverId: string;
  type: "driver-verification-pending";
}
