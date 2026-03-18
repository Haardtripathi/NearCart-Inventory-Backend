"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMiddleware = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const env_1 = require("../config/env");
const ApiError_1 = require("../utils/ApiError");
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
        errors: env_1.env.NODE_ENV === "development" ? [error instanceof Error ? error.message : String(error)] : [],
    });
};
exports.errorMiddleware = errorMiddleware;
