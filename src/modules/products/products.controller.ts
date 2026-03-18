import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext } from "../../utils/localization";
import {
  createProduct,
  createVariant,
  deleteProduct,
  deleteVariant,
  getProductById,
  listProducts,
  listVariants,
  updateProduct,
  updateVariant,
} from "./products.service";

export async function listProductsController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await listProducts(req.auth!.activeOrganizationId!, req.query as never, localeContext);
  return sendSuccess(res, 200, "Products fetched successfully", data);
}

export async function createProductController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await createProduct(req.auth!.activeOrganizationId!, req.auth!.userId, req.body, localeContext);
  return sendSuccess(res, 201, "Product created successfully", data);
}

export async function getProductController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await getProductById(req.auth!.activeOrganizationId!, req.params.id!, localeContext);
  return sendSuccess(res, 200, "Product fetched successfully", data);
}

export async function updateProductController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await updateProduct(
    req.auth!.activeOrganizationId!,
    req.params.id!,
    req.auth!.userId,
    req.body,
    localeContext,
  );
  return sendSuccess(res, 200, "Product updated successfully", data);
}

export async function deleteProductController(req: Request, res: Response) {
  const data = await deleteProduct(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Product deleted successfully", data);
}

export async function listVariantsController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await listVariants(req.auth!.activeOrganizationId!, req.params.id!, localeContext);
  return sendSuccess(res, 200, "Variants fetched successfully", data);
}

export async function createVariantController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await createVariant(
    req.auth!.activeOrganizationId!,
    req.params.id!,
    req.auth!.userId,
    req.body,
    localeContext,
  );
  return sendSuccess(res, 201, "Variant created successfully", data);
}

export async function updateVariantController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);
  const data = await updateVariant(
    req.auth!.activeOrganizationId!,
    req.params.id!,
    req.params.variantId!,
    req.auth!.userId,
    req.body,
    localeContext,
  );
  return sendSuccess(res, 200, "Variant updated successfully", data);
}

export async function deleteVariantController(req: Request, res: Response) {
  const data = await deleteVariant(
    req.auth!.activeOrganizationId!,
    req.params.id!,
    req.params.variantId!,
    req.auth!.userId,
  );
  return sendSuccess(res, 200, "Variant deleted successfully", data);
}
