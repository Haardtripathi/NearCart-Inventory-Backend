import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { getAnalyticsOverview, getReorderSuggestions } from "./analytics.service";

export async function getAnalyticsOverviewController(req: Request, res: Response) {
  const { branchId } = req.query as { branchId?: string };
  const data = await getAnalyticsOverview(req.auth!.activeOrganizationId!, branchId);
  return sendSuccess(res, 200, "Analytics overview fetched successfully", data);
}

export async function getReorderSuggestionsController(req: Request, res: Response) {
  const { branchId } = req.query as { branchId?: string };
  const data = await getReorderSuggestions(req.auth!.activeOrganizationId!, branchId);
  return sendSuccess(res, 200, "Reorder suggestions fetched successfully", data);
}
