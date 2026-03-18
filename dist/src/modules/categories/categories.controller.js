"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCategoriesController = listCategoriesController;
exports.getCategoryTreeController = getCategoryTreeController;
exports.createCategoryController = createCategoryController;
exports.getCategoryController = getCategoryController;
exports.updateCategoryController = updateCategoryController;
exports.deleteCategoryController = deleteCategoryController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const categories_service_1 = require("./categories.service");
async function listCategoriesController(req, res) {
    const data = await (0, categories_service_1.listCategories)(req.auth.activeOrganizationId, req.query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Categories fetched successfully", data);
}
async function getCategoryTreeController(req, res) {
    const data = await (0, categories_service_1.getCategoryTree)(req.auth.activeOrganizationId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Category tree fetched successfully", data);
}
async function createCategoryController(req, res) {
    const data = await (0, categories_service_1.createCategory)(req.auth.activeOrganizationId, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Category created successfully", data);
}
async function getCategoryController(req, res) {
    const data = await (0, categories_service_1.getCategoryById)(req.auth.activeOrganizationId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Category fetched successfully", data);
}
async function updateCategoryController(req, res) {
    const data = await (0, categories_service_1.updateCategory)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Category updated successfully", data);
}
async function deleteCategoryController(req, res) {
    const data = await (0, categories_service_1.deleteCategory)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Category deleted successfully", data);
}
