"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMasterCatalogCategoriesController = getMasterCatalogCategoriesController;
exports.getMasterCatalogCategoryTreeController = getMasterCatalogCategoryTreeController;
exports.createMasterCatalogCategoryController = createMasterCatalogCategoryController;
exports.updateMasterCatalogCategoryController = updateMasterCatalogCategoryController;
exports.getMasterCatalogItemsController = getMasterCatalogItemsController;
exports.getMasterCatalogItemController = getMasterCatalogItemController;
exports.createMasterCatalogItemController = createMasterCatalogItemController;
exports.updateMasterCatalogItemController = updateMasterCatalogItemController;
exports.importMasterCatalogItemController = importMasterCatalogItemController;
exports.importManyMasterCatalogItemsController = importManyMasterCatalogItemsController;
exports.getFeaturedMasterCatalogItemsController = getFeaturedMasterCatalogItemsController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
const master_catalog_service_1 = require("./master-catalog.service");
const master_catalog_import_service_1 = require("./master-catalog.import.service");
async function getMasterCatalogCategoriesController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, master_catalog_service_1.getMasterCatalogCategories)(req.query, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Master catalog categories fetched successfully", data);
}
async function getMasterCatalogCategoryTreeController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, master_catalog_service_1.getMasterCatalogCategoryTree)(req.query, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Master catalog category tree fetched successfully", data);
}
async function createMasterCatalogCategoryController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, master_catalog_service_1.createMasterCatalogCategory)(req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Master catalog category created successfully", data);
}
async function updateMasterCatalogCategoryController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, master_catalog_service_1.updateMasterCatalogCategory)(req.params.id, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Master catalog category updated successfully", data);
}
async function getMasterCatalogItemsController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, master_catalog_service_1.getMasterCatalogItems)(req.query, localeContext, req.auth?.activeOrganizationId ?? null);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Master catalog items fetched successfully", data);
}
async function getMasterCatalogItemController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, master_catalog_service_1.getMasterCatalogItemById)(req.params.id, localeContext, req.auth?.activeOrganizationId ?? null);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Master catalog item fetched successfully", data);
}
async function createMasterCatalogItemController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, master_catalog_service_1.createMasterCatalogItem)(req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Master catalog item created successfully", data);
}
async function updateMasterCatalogItemController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, master_catalog_service_1.updateMasterCatalogItem)(req.params.id, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Master catalog item updated successfully", data);
}
async function importMasterCatalogItemController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, master_catalog_import_service_1.importMasterCatalogItem)(req.params.id, req.auth.userId, req.auth.activeOrganizationId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Master catalog item import completed", data);
}
async function importManyMasterCatalogItemsController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, master_catalog_import_service_1.importManyMasterCatalogItems)(req.auth.userId, req.auth.activeOrganizationId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Master catalog items import completed", data);
}
async function getFeaturedMasterCatalogItemsController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, master_catalog_service_1.getFeaturedMasterCatalogItems)(req.params.industryId, req.query, localeContext, req.auth?.activeOrganizationId ?? null);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Featured master catalog items fetched successfully", data);
}
