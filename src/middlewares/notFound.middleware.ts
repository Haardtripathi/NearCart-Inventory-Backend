import type { Request, Response } from "express";

export function notFoundMiddleware(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: "Route not found",
    errors: [],
  });
}
