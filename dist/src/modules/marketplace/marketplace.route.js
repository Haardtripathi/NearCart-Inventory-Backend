"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketplaceRouter = void 0;
const express_1 = require("express");
const internalService_middleware_1 = require("../../middlewares/internalService.middleware");
const validate_middleware_1 = require("../../middlewares/validate.middleware");
const asyncHandler_1 = require("../../utils/asyncHandler");
const marketplace_controller_1 = require("./marketplace.controller");
const marketplace_validation_1 = require("./marketplace.validation");
// NOTE on the write-back contract (§3 of the phase-1 backend track): this router implements
// POST /organizations/:organizationId/sales-orders and GET /sales-orders/by-external/:externalOrderId
// exactly as documented (paths are relative to this router's /internal/marketplace mount, matching
// every other endpoint below). One judgment call not spelled out in the contract: `externalOrderId`
// is enforced unique GLOBALLY (Prisma `@unique`, not scoped per organization) since it is NearCart's
// own Order.id, which is already globally unique — so GET /sales-orders/by-external/:externalOrderId
// intentionally takes no organizationId. If NearCart's other agent assumed org-scoped lookup, this
// is the point to reconcile. See marketplace.service.ts createBridgedSalesOrder/getSalesOrderByExternalId
// for the rest of the implementation notes (customer find-or-create by phone, structured delivery
// address on SalesOrder.deliveryAddress). The two endpoints below it (cancel, active-order-count)
// ARE org-scoped in their path, unlike the read-by-external endpoint above — see each route's own
// comment for why.
exports.marketplaceRouter = (0, express_1.Router)();
exports.marketplaceRouter.use(internalService_middleware_1.requireInternalServiceAuth);
exports.marketplaceRouter.get("/organizations", (0, validate_middleware_1.validateRequest)({ query: marketplace_validation_1.marketplaceOrganizationsQuerySchema }), (0, asyncHandler_1.asyncHandler)(marketplace_controller_1.listMarketplaceOrganizationsController));
exports.marketplaceRouter.get("/organizations/:organizationId/catalog", (0, validate_middleware_1.validateRequest)({ query: marketplace_validation_1.marketplaceCatalogQuerySchema }), (0, asyncHandler_1.asyncHandler)(marketplace_controller_1.listMarketplaceCatalogController));
exports.marketplaceRouter.get("/organizations/:organizationId/catalog/:productId", (0, validate_middleware_1.validateRequest)({ query: marketplace_validation_1.marketplaceScopedQuerySchema }), (0, asyncHandler_1.asyncHandler)(marketplace_controller_1.getMarketplaceCatalogProductController));
exports.marketplaceRouter.post("/organizations/:organizationId/availability-check", (0, validate_middleware_1.validateRequest)({ body: marketplace_validation_1.marketplaceAvailabilitySchema }), (0, asyncHandler_1.asyncHandler)(marketplace_controller_1.checkMarketplaceAvailabilityController));
exports.marketplaceRouter.get("/organizations/:organizationId/categories", (0, validate_middleware_1.validateRequest)({ query: marketplace_validation_1.marketplaceScopedQuerySchema }), (0, asyncHandler_1.asyncHandler)(marketplace_controller_1.listMarketplaceCategoriesController));
exports.marketplaceRouter.get("/organizations/:organizationId/brands", (0, validate_middleware_1.validateRequest)({ query: marketplace_validation_1.marketplaceScopedQuerySchema }), (0, asyncHandler_1.asyncHandler)(marketplace_controller_1.listMarketplaceBrandsController));
exports.marketplaceRouter.post("/organizations/:organizationId/sales-orders", (0, validate_middleware_1.validateRequest)({ body: marketplace_validation_1.createBridgedSalesOrderSchema }), (0, asyncHandler_1.asyncHandler)(marketplace_controller_1.createBridgedSalesOrderController));
exports.marketplaceRouter.get("/sales-orders/by-external/:externalOrderId", (0, validate_middleware_1.validateRequest)({ params: marketplace_validation_1.externalOrderIdParamSchema }), (0, asyncHandler_1.asyncHandler)(marketplace_controller_1.getSalesOrderByExternalIdController));
// Cancel path is nested under /organizations/:organizationId (unlike the read-by-external
// endpoint above) so the caller confirms which org it expects the order to belong to —
// cancelBridgedSalesOrder 404s if the externalOrderId resolves to a different organization.
exports.marketplaceRouter.patch("/organizations/:organizationId/sales-orders/by-external/:externalOrderId/cancel", (0, validate_middleware_1.validateRequest)({ params: marketplace_validation_1.organizationExternalOrderIdParamSchema }), (0, asyncHandler_1.asyncHandler)(marketplace_controller_1.cancelBridgedSalesOrderController));
exports.marketplaceRouter.get("/organizations/:organizationId/branches/:branchId/active-order-count", (0, validate_middleware_1.validateRequest)({ params: marketplace_validation_1.organizationBranchParamSchema }), (0, asyncHandler_1.asyncHandler)(marketplace_controller_1.getBranchActiveOrderCountController));
