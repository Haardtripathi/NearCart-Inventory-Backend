"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSalesOrdersController = listSalesOrdersController;
exports.createSalesOrderController = createSalesOrderController;
exports.getSalesOrderController = getSalesOrderController;
exports.updateSalesOrderController = updateSalesOrderController;
exports.confirmSalesOrderController = confirmSalesOrderController;
exports.rejectSalesOrderController = rejectSalesOrderController;
exports.cancelSalesOrderController = cancelSalesOrderController;
exports.deliverSalesOrderController = deliverSalesOrderController;
exports.markSalesOrderReadyController = markSalesOrderReadyController;
exports.assignDriverToSalesOrderController = assignDriverToSalesOrderController;
const branchAccess_1 = require("../../utils/branchAccess");
const ApiResponse_1 = require("../../utils/ApiResponse");
const sales_orders_service_1 = require("./sales-orders.service");
// The order's branchId isn't known until it's loaded (route params only carry the order id), so
// every action below that mutates/reads a single order first loads it and checks branch access
// against its *actual* branchId before doing anything else — see utils/branchAccess.ts's doc
// comment for the bug this closes (a branch-scoped STAFF/MANAGER could otherwise confirm/reject/
// cancel/deliver another branch's order just by knowing its id). No-op for SUPER_ADMIN and
// ALL-scope callers (assertBranchAccessOrThrow's own no-op cases).
async function assertCanAccessOrder(req, organizationId, orderId) {
    const order = await (0, sales_orders_service_1.getSalesOrderById)(organizationId, orderId);
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, order.branchId);
    return order;
}
async function listSalesOrdersController(req, res) {
    const branchId = (0, branchAccess_1.resolveBranchFilter)(req.membership?.branchAccess, req.query.branchId);
    const data = await (0, sales_orders_service_1.listSalesOrders)(req.auth.activeOrganizationId, { ...req.query, branchId });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales orders fetched successfully", data);
}
async function createSalesOrderController(req, res) {
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.body.branchId);
    const data = await (0, sales_orders_service_1.createSalesOrder)(req.auth.activeOrganizationId, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Sales order created successfully", data);
}
async function getSalesOrderController(req, res) {
    const data = await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order fetched successfully", data);
}
async function updateSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    // A body-supplied branchId would move the order to a different branch — validate that target
    // too, not just where it currently lives.
    if (req.body.branchId) {
        (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.body.branchId);
    }
    const data = await (0, sales_orders_service_1.updateSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order updated successfully", data);
}
async function confirmSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.confirmSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order confirmed successfully", data);
}
async function rejectSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.rejectSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body.rejectionReason);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order rejected successfully", data);
}
async function cancelSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.cancelSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order cancelled successfully", data);
}
async function deliverSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.deliverSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order delivered successfully", data);
}
async function markSalesOrderReadyController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.markSalesOrderReady)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order marked ready successfully", data);
}
async function assignDriverToSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.assignDriverToSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body.driverId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Driver assigned successfully", data);
}
