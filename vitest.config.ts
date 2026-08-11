import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.spec.ts"],
    // All scenario files share one on-disk SQLite file (test.db) materialized once by
    // global-setup.ts. Running test FILES in parallel would mean multiple worker
    // processes/threads opening concurrent write connections to that same file — a real
    // corruption/"database is locked" risk this suite has no reason to take on, since the whole
    // point of tagging data with random suffixes is order-independence, not concurrency. Forcing
    // files to run one after another (tests within a file still run in normal vitest order)
    // sidesteps that entirely.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
