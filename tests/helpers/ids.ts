import crypto from "node:crypto";

/**
 * Short random tag used to keep every scenario file's data (org/branch/product/driver
 * names+emails+phones) collision-free without relying on tests running in a particular order or
 * on the DB being reset between files/tests — see the "Constraints" section of this suite's task
 * brief. 10 hex chars is comfortably enough entropy for a single test run.
 */
export function uniqueSuffix(): string {
  return crypto.randomBytes(5).toString("hex");
}
