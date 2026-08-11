// Loaded once per test FILE via vitest's `setupFiles` (see ../vitest.config.ts), and guaranteed by
// vitest to run to completion before that file's own imports (e.g. `import { app } from
// "../../src/app"`) are evaluated. This is deliberate and load-bearing: src/config/env.ts reads
// `process.env` at module-import time (a top-level Zod `.safeParse(process.env)`), so the dotenv
// load below MUST happen before anything that transitively imports env.ts. Do not add any other
// import above the dotenv load in this file.
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });

// Hard guard rail: this must make it structurally impossible for the suite to ever hit the real
// Turso database, even if .env.test is missing, misconfigured, or someone points DATABASE_URL at
// a libsql:// URL by mistake. A `file:` URL is the only shape this suite is ever allowed to run
// against — see tests/global-setup.ts for the matching guard around the `prisma db push` that
// materializes this file's schema.
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !databaseUrl.startsWith("file:")) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL must be a local "file:" SQLite URL, got ${JSON.stringify(
      databaseUrl,
    )}. This guard exists specifically so the test suite can never touch the live Turso database.`,
  );
}
