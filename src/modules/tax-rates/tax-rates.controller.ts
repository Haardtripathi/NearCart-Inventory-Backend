import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { createTaxRate, listTaxRates, updateTaxRate } from "./tax-rates.service";

export async function listTaxRatesController(req: Request, res: Response) {
  const data = await listTaxRates(req.auth!.activeOrganizationId!, req.query as never);
  return sendSuccess(res, 200, "Tax rates fetched successfully", data);
}

export async function createTaxRateController(req: Request, res: Response) {
  const data = await createTaxRate(req.auth!.activeOrganizationId!, req.auth!.userId, req.body);
  return sendSuccess(res, 201, "Tax rate created successfully", data);
}

export async function updateTaxRateController(req: Request, res: Response) {
  const data = await updateTaxRate(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId, req.body);
  return sendSuccess(res, 200, "Tax rate updated successfully", data);
}
