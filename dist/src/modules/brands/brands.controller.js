"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBrandsController = listBrandsController;
exports.createBrandController = createBrandController;
exports.updateBrandController = updateBrandController;
exports.deleteBrandController = deleteBrandController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const brands_service_1 = require("./brands.service");
async function listBrandsController(req, res) {
    const data = await (0, brands_service_1.listBrands)(req.auth.activeOrganizationId, req.query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Brands fetched successfully", data);
}
async function createBrandController(req, res) {
    const data = await (0, brands_service_1.createBrand)(req.auth.activeOrganizationId, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Brand created successfully", data);
}
async function updateBrandController(req, res) {
    const data = await (0, brands_service_1.updateBrand)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Brand updated successfully", data);
}
async function deleteBrandController(req, res) {
    const data = await (0, brands_service_1.deleteBrand)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Brand deleted successfully", data);
}
