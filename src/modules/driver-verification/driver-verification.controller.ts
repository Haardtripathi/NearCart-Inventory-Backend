import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { confirmDriverLicense, ocrDriverLicense, verifyDriverVehiclePhoto } from "./driver-verification.service";

export async function verifyDriverVehiclePhotoController(req: Request, res: Response) {
  if (!req.file) {
    throw ApiError.badRequest("Photo file is required");
  }

  const data = await verifyDriverVehiclePhoto(req.driverAuth!.driverId, {
    buffer: req.file.buffer,
    originalname: req.file.originalname,
  });

  return sendSuccess(res, 200, "Vehicle photo verification completed", data);
}

export async function ocrDriverLicenseController(req: Request, res: Response) {
  if (!req.file) {
    throw ApiError.badRequest("Photo file is required");
  }

  const data = await ocrDriverLicense(req.driverAuth!.driverId, {
    buffer: req.file.buffer,
    originalname: req.file.originalname,
  });

  return sendSuccess(res, 200, "License OCR completed", data);
}

export async function confirmDriverLicenseController(req: Request, res: Response) {
  const data = await confirmDriverLicense(req.driverAuth!.driverId, req.body);
  return sendSuccess(res, 200, "License verification completed", data);
}
