"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMarketplaceOrganizationsController = listMarketplaceOrganizationsController;
exports.listMarketplaceCatalogController = listMarketplaceCatalogController;
exports.getMarketplaceCatalogProductController = getMarketplaceCatalogProductController;
exports.checkMarketplaceAvailabilityController = checkMarketplaceAvailabilityController;
exports.listMarketplaceCategoriesController = listMarketplaceCategoriesController;
exports.listMarketplaceBrandsController = listMarketplaceBrandsController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
const marketplace_service_1 = require("./marketplace.service");
function resolveRequestedLanguage(req) {
    const queryLanguage = typeof req.query.lang === "string" ? (0, localization_1.normalizeLanguageCode)(req.query.lang) : null;
    const headerLanguage = (0, localization_1.parseAcceptLanguageHeader)(typeof req.headers["accept-language"] === "string" ? req.headers["accept-language"] : null);
    return queryLanguage ?? headerLanguage;
}
async function listMarketplaceOrganizationsController(req, res) {
    const data = await (0, marketplace_service_1.listMarketplaceOrganizations)(req.query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Marketplace organizations fetched successfully", data);
}
async function listMarketplaceCatalogController(req, res) {
    const requestedLanguage = resolveRequestedLanguage(req);
    const data = await (0, marketplace_service_1.listMarketplaceCatalog)(req.params.organizationId, req.query, { requestedLanguage });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Marketplace catalog fetched successfully", data);
}
async function getMarketplaceCatalogProductController(req, res) {
    const requestedLanguage = resolveRequestedLanguage(req);
    const data = await (0, marketplace_service_1.getMarketplaceCatalogProduct)(req.params.organizationId, String(req.query.branchId ?? ""), req.params.productId, { requestedLanguage });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Marketplace catalog product fetched successfully", data);
}
async function checkMarketplaceAvailabilityController(req, res) {
    const requestedLanguage = resolveRequestedLanguage(req);
    const data = await (0, marketplace_service_1.checkMarketplaceAvailability)(req.params.organizationId, req.body, { requestedLanguage });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Marketplace availability checked successfully", data);
}
async function listMarketplaceCategoriesController(req, res) {
    const requestedLanguage = resolveRequestedLanguage(req);
    const data = await (0, marketplace_service_1.listMarketplaceCategories)(req.params.organizationId, {
        requestedLanguage,
    });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Marketplace categories fetched successfully", { items: data });
}
async function listMarketplaceBrandsController(req, res) {
    const requestedLanguage = resolveRequestedLanguage(req);
    const data = await (0, marketplace_service_1.listMarketplaceBrands)(req.params.organizationId, {
        requestedLanguage,
    });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Marketplace brands fetched successfully", { items: data });
}
