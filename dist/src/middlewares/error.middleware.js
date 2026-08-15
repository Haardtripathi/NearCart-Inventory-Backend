"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMiddleware = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const env_1 = require("../config/env");
const ApiError_1 = require("../utils/ApiError");
const prismaErrors_1 = require("../utils/prismaErrors");
/**
 * `error.meta` on a constraint-violation `PrismaClientKnownRequestError` is safe/minimal under
 * Prisma's native connectors (e.g. `{ target: ["organizationId", "slug"] }`), but under the
 * libSQL/Turso driver adapter it instead carries a `driverAdapterError` blob with the raw SQL
 * error text (table/column names, full constraint message) — verified live. That's fine to log
 * server-side but should never go to the client regardless of environment (unlike the generic
 * 500 branch below, which already gates its raw message behind NODE_ENV=development). Keep only
 * the one genuinely useful, safe field (`modelName`) for callers to act on.
 */
function sanitizeConstraintMeta(meta) {
    if (meta && typeof meta === "object" && "modelName" in meta && !("driverAdapterError" in meta)) {
        // Native-connector shape (no adapter wrapper) — already safe to pass through as-is.
        return meta;
    }
    if (meta && typeof meta === "object" && "modelName" in meta) {
        return { modelName: meta.modelName };
    }
    return [];
}
const errorMiddleware = (error, _req, res, _next) => {
    if (error instanceof ApiError_1.ApiError) {
        return res.status(error.statusCode).json({
            success: false,
            message: error.message,
            errors: error.errors ?? [],
        });
    }
    if (error instanceof zod_1.ZodError) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: error.flatten().fieldErrors,
        });
    }
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        // See utils/prismaErrors.ts: the libSQL/Turso driver adapter doesn't map raw SQLite
        // constraint violations to the standard P2002/P2003 codes, so these checks can't rely on
        // `error.code` alone.
        if ((0, prismaErrors_1.isUniqueConstraintError)(error)) {
            console.warn("[errorMiddleware] Unique constraint violation", error.meta ?? error.message);
            return res.status(409).json({
                success: false,
                message: "A record with the same unique field already exists",
                errors: sanitizeConstraintMeta(error.meta),
            });
        }
        if ((0, prismaErrors_1.isForeignKeyConstraintError)(error)) {
            console.warn("[errorMiddleware] Foreign key constraint violation", error.meta ?? error.message);
            return res.status(409).json({
                success: false,
                message: "This action references a related record that doesn't exist or is still in use elsewhere",
                errors: sanitizeConstraintMeta(error.meta),
            });
        }
        if ((0, prismaErrors_1.isRecordNotFoundError)(error)) {
            return res.status(404).json({
                success: false,
                message: "Requested resource was not found",
                errors: [],
            });
        }
    }
    // Unlike the branches above (known, expected error shapes), reaching here means something
    // genuinely unanticipated blew up mid-request. Previously this branch logged nothing at all,
    // so a real 500 was a silent black hole server-side — confirmed live during the 2026-08-09
    // regression sweep: the browser saw several real 500s from concurrent request load, but
    // nothing appeared anywhere in the server log to investigate. Always log stack traces
    // server-side (never sent to the client either way) so this stops being invisible.
    console.error("[errorMiddleware] Unhandled error", error);
    return res.status(500).json({
        success: false,
        message: "Internal server error",
        errors: env_1.env.NODE_ENV === "development" ? [error instanceof Error ? error.message : String(error)] : [],
    });
};
exports.errorMiddleware = errorMiddleware;
