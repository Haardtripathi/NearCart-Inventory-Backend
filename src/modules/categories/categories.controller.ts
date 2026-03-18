import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext } from "../../utils/localization";
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  getCategoryTree,
  listCategories,
  updateCategory,
} from "./categories.service";

export async function listCategoriesController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await listCategories(req.auth!.activeOrganizationId!, req.query as never, localeContext);
  return sendSuccess(res, 200, "Categories fetched successfully", data);
}

export async function getCategoryTreeController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getCategoryTree(req.auth!.activeOrganizationId!, localeContext);
  return sendSuccess(res, 200, "Category tree fetched successfully", data);
}

export async function createCategoryController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await createCategory(req.auth!.activeOrganizationId!, req.auth!.userId, req.body, localeContext);
  return sendSuccess(res, 201, "Category created successfully", data);
}

export async function getCategoryController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getCategoryById(req.auth!.activeOrganizationId!, req.params.id!, localeContext);
  return sendSuccess(res, 200, "Category fetched successfully", data);
}

export async function updateCategoryController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await updateCategory(
    req.auth!.activeOrganizationId!,
    req.params.id!,
    req.auth!.userId,
    req.body,
    localeContext,
  );
  return sendSuccess(res, 200, "Category updated successfully", data);
}

export async function deleteCategoryController(req: Request, res: Response) {
  const data = await deleteCategory(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Category deleted successfully", data);
}
