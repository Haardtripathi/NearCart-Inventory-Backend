// Vitest `globalSetup` (see vitest.config.ts) — runs exactly ONCE, in a separate process, before
// any test file loads (unlike tests/setup.ts's `setupFiles`, which runs once per test file). This
// is the right place to materialize the on-disk SQLite schema exactly once for the whole run, and
// to delete it exactly once at the very end.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const BACKEND_ROOT = path.resolve(__dirname, "..");
const ENV_TEST_PATH = path.resolve(BACKEND_ROOT, ".env.test");

/**
 * Reads DATABASE_URL directly out of .env.test on disk (not process.env — this runs in its own
 * process, separate from tests/setup.ts's per-file dotenv load) and asserts it's a local `file:`
 * URL. Same hard guard rail as tests/setup.ts, duplicated deliberately: this file is what actually
 * runs `prisma db push`, i.e. the one place in this whole suite capable of mutating a real
 * database's schema, so it must never trust that some other file already checked.
 */
function loadTestDatabaseUrl(): string {
  const parsed = dotenv.parse(fs.readFileSync(ENV_TEST_PATH, "utf8"));
  const databaseUrl = parsed.DATABASE_URL;

  if (!databaseUrl || !databaseUrl.startsWith("file:")) {
    throw new Error(
      `Refusing to run the test DB lifecycle: .env.test's DATABASE_URL must start with "file:", got ` +
        `${JSON.stringify(databaseUrl)}. This guard exists specifically so the test suite can never run ` +
        `\`prisma db push\` against the live Turso database.`,
    );
  }

  return databaseUrl;
}

function resolveDbFilePath(databaseUrl: string): string {
  // `file:./test.db` -> resolved relative to the backend root, matching where `prisma db push`
  // below is spawned from (cwd: BACKEND_ROOT) and how @prisma/adapter-libsql resolves it at
  // runtime for the app itself.
  const relativePath = databaseUrl.replace(/^file:/, "");
  return path.resolve(BACKEND_ROOT, relativePath);
}

export async function setup() {
  const databaseUrl = loadTestDatabaseUrl();

  console.log(`[tests/global-setup] Materializing test schema at ${databaseUrl} via prisma db push...`);

  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "db", "push", "--accept-data-loss", "--schema=./prisma/schema.prisma"],
    {
      cwd: BACKEND_ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        // Explicit override, not a merge-and-hope: whatever DATABASE_URL/DATABASE_AUTH_TOKEN this
        // process inherited from the shell (e.g. a real .env someone has sourced) must not leak
        // into the child `prisma db push` invocation. DATABASE_AUTH_TOKEN is cleared outright since
        // a `file:` URL needs none, and env.ts's own refine() would otherwise be the only thing
        // stopping a stray leftover token from being (harmlessly, but confusingly) present.
        DATABASE_URL: databaseUrl,
        DATABASE_AUTH_TOKEN: "",
        NODE_ENV: "test",
      },
    },
  );

  if (result.status !== 0) {
    throw new Error(`prisma db push failed with exit code ${result.status ?? "unknown"}`);
  }
}

export async function teardown() {
  const databaseUrl = loadTestDatabaseUrl();
  const dbFilePath = resolveDbFilePath(databaseUrl);

  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const candidate = `${dbFilePath}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.rmSync(candidate);
    }
  }
}
