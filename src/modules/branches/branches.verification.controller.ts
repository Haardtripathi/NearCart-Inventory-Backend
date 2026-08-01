import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { verifyShopPhoto } from "./branches.verification.service";

export async function verifyShopPhotoController(req: Request, res: Response) {
  if (!req.file) {
    throw ApiError.badRequest("Photo file is required");
  }

  const data = await verifyShopPhoto(
    req.auth!.activeOrganizationId!,
    req.params.id!,
    req.auth!.userId,
    { buffer: req.file.buffer, originalname: req.file.originalname },
  );

  return sendSuccess(res, 200, "Shop photo verification completed", data);
}
