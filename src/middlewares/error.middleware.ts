import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import {
  isForeignKeyConstraintError,
  isRecordNotFoundError,
  isUniqueConstraintError,
} from "../utils/prismaErrors";

/**
 * `error.meta` on a constraint-violation `PrismaClientKnownRequestError` is safe/minimal under
 * Prisma's native connectors (e.g. `{ target: ["organizationId", "slug"] }`), but under the
 * libSQL/Turso driver adapter it instead carries a `driverAdapterError` blob with the raw SQL
 * error text (table/column names, full constraint message) — verified live. That's fine to log
 * server-side but should never go to the client regardless of environment (unlike the generic
 * 500 branch below, which already gates its raw message behind NODE_ENV=development). Keep only
 * the one genuinely useful, safe field (`modelName`) for callers to act on.
 */
function sanitizeConstraintMeta(meta: unknown): unknown {
  if (meta && typeof meta === "object" && "modelName" in meta && !("driverAdapterError" in meta)) {
    // Native-connector shape (no adapter wrapper) — already safe to pass through as-is.
    return meta;
  }

  if (meta && typeof meta === "object" && "modelName" in meta) {
    return { modelName: (meta as { modelName?: unknown }).modelName };
  }

  return [];
}

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errors: error.errors ?? [],
    });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.flatten().fieldErrors,
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // See utils/prismaErrors.ts: the libSQL/Turso driver adapter doesn't map raw SQLite
    // constraint violations to the standard P2002/P2003 codes, so these checks can't rely on
    // `error.code` alone.
    if (isUniqueConstraintError(error)) {
      console.warn("[errorMiddleware] Unique constraint violation", error.meta ?? error.message);
      return res.status(409).json({
        success: false,
        message: "A record with the same unique field already exists",
        errors: sanitizeConstraintMeta(error.meta),
      });
    }

    if (isForeignKeyConstraintError(error)) {
      console.warn("[errorMiddleware] Foreign key constraint violation", error.meta ?? error.message);
      return res.status(409).json({
        success: false,
        message: "This action references a related record that doesn't exist or is still in use elsewhere",
        errors: sanitizeConstraintMeta(error.meta),
      });
    }

    if (isRecordNotFoundError(error)) {
      return res.status(404).json({
        success: false,
        message: "Requested resource was not found",
        errors: [],
      });
    }
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
    errors: env.NODE_ENV === "development" ? [error instanceof Error ? error.message : String(error)] : [],
  });
};
