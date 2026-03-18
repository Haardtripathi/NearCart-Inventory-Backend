import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

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
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "A record with the same unique field already exists",
        errors: error.meta,
      });
    }

    if (error.code === "P2025") {
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
