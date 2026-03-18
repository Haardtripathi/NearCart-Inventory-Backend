"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProductsController = listProductsController;
exports.createProductController = createProductController;
exports.getProductController = getProductController;
exports.updateProductController = updateProductController;
exports.deleteProductController = deleteProductController;
exports.listVariantsController = listVariantsController;
exports.createVariantController = createVariantController;
exports.updateVariantController = updateVariantController;
exports.deleteVariantController = deleteVariantController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
const products_service_1 = require("./products.service");
async function listProductsController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, products_service_1.listProducts)(req.auth.activeOrganizationId, req.query, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Products fetched successfully", data);
}
async function createProductController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, products_service_1.createProduct)(req.auth.activeOrganizationId, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Product created successfully", data);
}
async function getProductController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, products_service_1.getProductById)(req.auth.activeOrganizationId, req.params.id, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Product fetched successfully", data);
}
async function updateProductController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, products_service_1.updateProduct)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Product updated successfully", data);
}
async function deleteProductController(req, res) {
    const data = await (0, products_service_1.deleteProduct)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Product deleted successfully", data);
}
async function listVariantsController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, products_service_1.listVariants)(req.auth.activeOrganizationId, req.params.id, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Variants fetched successfully", data);
}
async function createVariantController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, products_service_1.createVariant)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Variant created successfully", data);
}
async function updateVariantController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, products_service_1.updateVariant)(req.auth.activeOrganizationId, req.params.id, req.params.variantId, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Variant updated successfully", data);
}
async function deleteVariantController(req, res) {
    const data = await (0, products_service_1.deleteVariant)(req.auth.activeOrganizationId, req.params.id, req.params.variantId, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Variant deleted successfully", data);
}
