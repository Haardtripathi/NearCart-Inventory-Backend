import type { Response } from "express";

export class ApiResponse<T> {
  success = true;

  constructor(
    public message: string,
    public data?: T,
  ) {}
}

export function sendSuccess<T>(res: Response, statusCode: number, message: string, data?: T) {
  return res.status(statusCode).json(new ApiResponse(message, data));
}
