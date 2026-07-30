"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUniqueConstraintError = isUniqueConstraintError;
exports.isForeignKeyConstraintError = isForeignKeyConstraintError;
exports.isRecordNotFoundError = isRecordNotFoundError;
/**
 * Prisma 7 + the libSQL/Turso driver adapter (`@prisma/adapter-libsql`) does not translate raw
 * SQLite constraint violations into the standard P2002 (unique)/P2003 (foreign key) error codes
 * the native connectors use. Verified live against this Turso DB: both come back as
 * `PrismaClientKnownRequestError` with an opaque `code: "P2039"` — the real reason is only
 * present in the message text, e.g.
 *   "Database error. Code: `N/A`. Message: `SQLITE_CONSTRAINT: ... UNIQUE constraint failed: ...`"
 *   "Database error. Code: `N/A`. Message: `SQLITE_CONSTRAINT: ... FOREIGN KEY constraint failed`"
 * (P2025 "record not found" on update/delete IS still mapped correctly by this adapter — only
 * constraint violations are affected.)
 *
 * Every `error.code === "P2002"` check anywhere in this codebase silently stopped matching the
 * moment the Postgres -> Turso migration happened this session, turning what should be 409
 * conflicts into raw 500s (found independently across categories/brands/branches during API
 * testing) and breaking the marketplace bridge's idempotent-retry handling for duplicate
 * `externalOrderId` pushes (marketplace.service.ts). Use these helpers instead of comparing
 * `error.code` directly, anywhere this app needs to distinguish "duplicate key" or "dangling
 * reference" from any other database error.
 */
// Deliberately typed as plain `boolean`, not a `error is Prisma.PrismaClientKnownRequestError`
// type predicate: at every call site in this codebase the caller already knows `error` is a
// `PrismaClientKnownRequestError` (from its own `instanceof` check) before calling these — a
// same-type predicate would make TypeScript narrow the falsy branch to `never`, which is worse
// than no narrowing at all.
function isUniqueConstraintError(error) {
    return error.code === "P2002" || /UNIQUE constraint failed/i.test(error.message);
}
function isForeignKeyConstraintError(error) {
    return error.code === "P2003" || /FOREIGN KEY constraint failed/i.test(error.message);
}
function isRecordNotFoundError(error) {
    return error.code === "P2025";
}
