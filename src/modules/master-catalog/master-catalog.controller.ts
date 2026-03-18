import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext } from "../../utils/localization";
import {
  createMasterCatalogCategory,
  createMasterCatalogItem,
  getFeaturedMasterCatalogItems,
  getMasterCatalogItemById,
  getMasterCatalogItems,
  getMasterCatalogCategories,
  getMasterCatalogCategoryTree,
  updateMasterCatalogCategory,
  updateMasterCatalogItem,
} from "./master-catalog.service";
import { importManyMasterCatalogItems, importMasterCatalogItem } from "./master-catalog.import.service";

export async function getMasterCatalogCategoriesController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getMasterCatalogCategories(req.query as never, localeContext);
  return sendSuccess(res, 200, "Master catalog categories fetched successfully", data);
}

export async function getMasterCatalogCategoryTreeController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getMasterCatalogCategoryTree(req.query as never, localeContext);
  return sendSuccess(res, 200, "Master catalog category tree fetched successfully", data);
}

export async function createMasterCatalogCategoryController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await createMasterCatalogCategory(req.auth!.userId, req.body, localeContext);
  return sendSuccess(res, 201, "Master catalog category created successfully", data);
}

export async function updateMasterCatalogCategoryController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await updateMasterCatalogCategory(req.params.id!, req.auth!.userId, req.body, localeContext);
  return sendSuccess(res, 200, "Master catalog category updated successfully", data);
}

export async function getMasterCatalogItemsController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getMasterCatalogItems(req.query as never, localeContext, req.auth?.activeOrganizationId ?? null);
  return sendSuccess(res, 200, "Master catalog items fetched successfully", data);
}

export async function getMasterCatalogItemController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getMasterCatalogItemById(req.params.id!, localeContext, req.auth?.activeOrganizationId ?? null);
  return sendSuccess(res, 200, "Master catalog item fetched successfully", data);
}

export async function createMasterCatalogItemController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await createMasterCatalogItem(req.auth!.userId, req.body, localeContext);
  return sendSuccess(res, 201, "Master catalog item created successfully", data);
}

export async function updateMasterCatalogItemController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await updateMasterCatalogItem(req.params.id!, req.auth!.userId, req.body, localeContext);
  return sendSuccess(res, 200, "Master catalog item updated successfully", data);
}

export async function importMasterCatalogItemController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await importMasterCatalogItem(
    req.params.id!,
    req.auth!.userId,
    req.auth!.activeOrganizationId!,
    req.body,
    localeContext,
  );
  return sendSuccess(res, 201, "Master catalog item import completed", data);
}

export async function importManyMasterCatalogItemsController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await importManyMasterCatalogItems(
    req.auth!.userId,
    req.auth!.activeOrganizationId!,
    req.body,
    localeContext,
  );
  return sendSuccess(res, 201, "Master catalog items import completed", data);
}

export async function getFeaturedMasterCatalogItemsController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getFeaturedMasterCatalogItems(
    req.params.industryId!,
    req.query as never,
    localeContext,
    req.auth?.activeOrganizationId ?? null,
  );
  return sendSuccess(res, 200, "Featured master catalog items fetched successfully", data);
}
