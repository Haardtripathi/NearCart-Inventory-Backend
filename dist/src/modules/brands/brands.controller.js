"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBrandsController = listBrandsController;
exports.createBrandController = createBrandController;
exports.getBrandController = getBrandController;
exports.updateBrandController = updateBrandController;
exports.deleteBrandController = deleteBrandController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
const brands_service_1 = require("./brands.service");
async function listBrandsController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, brands_service_1.listBrands)(req.auth.activeOrganizationId, req.query, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Brands fetched successfully", data);
}
async function createBrandController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, brands_service_1.createBrand)(req.auth.activeOrganizationId, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Brand created successfully", data);
}
async function getBrandController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, brands_service_1.getBrandById)(req.auth.activeOrganizationId, req.params.id, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Brand fetched successfully", data);
}
async function updateBrandController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    const data = await (0, brands_service_1.updateBrand)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body, localeContext);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Brand updated successfully", data);
}
async function deleteBrandController(req, res) {
    const data = await (0, brands_service_1.deleteBrand)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Brand deleted successfully", data);
}
