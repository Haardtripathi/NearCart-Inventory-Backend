"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsOverviewController = getAnalyticsOverviewController;
exports.getReorderSuggestionsController = getReorderSuggestionsController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const analytics_service_1 = require("./analytics.service");
async function getAnalyticsOverviewController(req, res) {
    const { branchId } = req.query;
    const data = await (0, analytics_service_1.getAnalyticsOverview)(req.auth.activeOrganizationId, branchId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Analytics overview fetched successfully", data);
}
async function getReorderSuggestionsController(req, res) {
    const { branchId } = req.query;
    const data = await (0, analytics_service_1.getReorderSuggestions)(req.auth.activeOrganizationId, branchId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Reorder suggestions fetched successfully", data);
}
