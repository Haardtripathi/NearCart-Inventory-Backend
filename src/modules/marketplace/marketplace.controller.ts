import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import {
  normalizeLanguageCode,
  parseAcceptLanguageHeader,
} from "../../utils/localization";
import {
  checkMarketplaceAvailability,
  getMarketplaceCatalogProduct,
  listMarketplaceBrands,
  listMarketplaceCatalog,
  listMarketplaceCategories,
  listMarketplaceOrganizations,
} from "./marketplace.service";

function resolveRequestedLanguage(req: Request) {
  const queryLanguage =
    typeof req.query.lang === "string" ? normalizeLanguageCode(req.query.lang) : null;
  const headerLanguage = parseAcceptLanguageHeader(
    typeof req.headers["accept-language"] === "string" ? req.headers["accept-language"] : null,
  );

  return queryLanguage ?? headerLanguage;
}

export async function listMarketplaceOrganizationsController(req: Request, res: Response) {
  const data = await listMarketplaceOrganizations(req.query as { search?: string });
  return sendSuccess(res, 200, "Marketplace organizations fetched successfully", data);
}

export async function listMarketplaceCatalogController(req: Request, res: Response) {
  const requestedLanguage = resolveRequestedLanguage(req);

  const data = await listMarketplaceCatalog(
    req.params.organizationId!,
    req.query as never,
    { requestedLanguage },
  );

  return sendSuccess(res, 200, "Marketplace catalog fetched successfully", data);
}

export async function getMarketplaceCatalogProductController(req: Request, res: Response) {
  const requestedLanguage = resolveRequestedLanguage(req);

  const data = await getMarketplaceCatalogProduct(
    req.params.organizationId!,
    String(req.query.branchId ?? ""),
    req.params.productId!,
    { requestedLanguage },
  );

  return sendSuccess(res, 200, "Marketplace catalog product fetched successfully", data);
}

export async function checkMarketplaceAvailabilityController(req: Request, res: Response) {
  const requestedLanguage = resolveRequestedLanguage(req);

  const data = await checkMarketplaceAvailability(
    req.params.organizationId!,
    req.body,
    { requestedLanguage },
  );

  return sendSuccess(res, 200, "Marketplace availability checked successfully", data);
}

export async function listMarketplaceCategoriesController(req: Request, res: Response) {
  const requestedLanguage = resolveRequestedLanguage(req);
  const data = await listMarketplaceCategories(req.params.organizationId!, {
    requestedLanguage,
  });

  return sendSuccess(res, 200, "Marketplace categories fetched successfully", { items: data });
}

export async function listMarketplaceBrandsController(req: Request, res: Response) {
  const requestedLanguage = resolveRequestedLanguage(req);
  const data = await listMarketplaceBrands(req.params.organizationId!, {
    requestedLanguage,
  });

  return sendSuccess(res, 200, "Marketplace brands fetched successfully", { items: data });
}
