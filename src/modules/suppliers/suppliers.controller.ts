import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext } from "../../utils/localization";
import {
  createSupplier,
  deleteSupplier,
  getSupplierById,
  listSuppliers,
  updateSupplier,
} from "./suppliers.service";

export async function listSuppliersController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await listSuppliers(req.auth!.activeOrganizationId!, req.query as never, localeContext);
  return sendSuccess(res, 200, "Suppliers fetched successfully", data);
}

export async function createSupplierController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await createSupplier(req.auth!.activeOrganizationId!, req.auth!.userId, req.body, localeContext);
  return sendSuccess(res, 201, "Supplier created successfully", data);
}

export async function getSupplierController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getSupplierById(req.auth!.activeOrganizationId!, req.params.id!, localeContext);
  return sendSuccess(res, 200, "Supplier fetched successfully", data);
}

export async function updateSupplierController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await updateSupplier(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId, req.body, localeContext);
  return sendSuccess(res, 200, "Supplier updated successfully", data);
}

export async function deleteSupplierController(req: Request, res: Response) {
  const data = await deleteSupplier(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Supplier deleted successfully", data);
}
