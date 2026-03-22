import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { uploadImageToCloudinary, type ImageUploadScope } from "./uploads.service";

function parseScope(value: unknown): ImageUploadScope {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "general";

  switch (normalized) {
    case "product":
    case "category":
    case "brand":
    case "supplier":
    case "customer":
    case "branch":
    case "master-catalog-item":
    case "master-catalog-category":
      return normalized;
    default:
      return "general";
  }
}

export async function uploadImageController(req: Request, res: Response) {
  if (!req.file) {
    throw ApiError.badRequest("Image file is required");
  }

  const scope = parseScope(req.body.scope);
  const ownerId = req.auth?.activeOrganizationId ?? "platform";
  const data = await uploadImageToCloudinary({
    fileBuffer: req.file.buffer,
    originalFilename: req.file.originalname,
    scope,
    ownerId,
  });

  return sendSuccess(res, 201, "Image uploaded successfully", data);
}
