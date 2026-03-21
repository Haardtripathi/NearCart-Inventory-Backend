import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext } from "../../utils/localization";
import { createBrand, deleteBrand, getBrandById, listBrands, updateBrand } from "./brands.service";

export async function listBrandsController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await listBrands(req.auth!.activeOrganizationId!, req.query as never, localeContext);
  return sendSuccess(res, 200, "Brands fetched successfully", data);
}

export async function createBrandController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await createBrand(req.auth!.activeOrganizationId!, req.auth!.userId, req.body, localeContext);
  return sendSuccess(res, 201, "Brand created successfully", data);
}

export async function getBrandController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getBrandById(req.auth!.activeOrganizationId!, req.params.id!, localeContext);
  return sendSuccess(res, 200, "Brand fetched successfully", data);
}

export async function updateBrandController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await updateBrand(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId, req.body, localeContext);
  return sendSuccess(res, 200, "Brand updated successfully", data);
}

export async function deleteBrandController(req: Request, res: Response) {
  const data = await deleteBrand(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Brand deleted successfully", data);
}
