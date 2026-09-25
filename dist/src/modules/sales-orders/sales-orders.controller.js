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
exports.dispatchSalesOrderController = dispatchSalesOrderController;
exports.assignDriverToSalesOrderController = assignDriverToSalesOrderController;
exports.proposePartialFulfilmentController = proposePartialFulfilmentController;
const branchAccess_1 = require("../../utils/branchAccess");
const ApiResponse_1 = require("../../utils/ApiResponse");
const orderPayment_1 = require("../../utils/orderPayment");
const partialFulfilment_1 = require("../../utils/partialFulfilment");
const sales_orders_service_1 = require("./sales-orders.service");
// Every order this controller returns (list rows, detail, and the order echoed back by each
// lifecycle action — the Partner app replaces its cached detail with those) gets three explicit
// derived fields, all parsed out of the `deliveryAddress` Json column so no client ever has to
// dig through it: `payment` (nullable — the NearCart delivery fee/discount/method breakdown),
// `amountToCollect` (what the DRIVER collects at the door), and `partialFulfilment` (nullable —
// the shop's "I can only supply 3 of your 5 items" proposal and where it stands). `total` stays
// goods-value only. Applied here rather than inside the service functions because those same
// return values are reused internally (audit-log snapshots, status checks) where derived fields
// don't belong. See utils/orderPayment.ts and utils/partialFulfilment.ts.
//
// Renamed from `withPaymentView` when partial fulfilment was added — it is no longer only about
// money.
function withOrderView(order) {
    return { ...order, ...(0, orderPayment_1.buildOrderPaymentView)(order), ...(0, partialFulfilment_1.buildPartialFulfilmentView)(order) };
}
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
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales orders fetched successfully", {
        ...data,
        items: data.items.map((order) => withOrderView(order)),
    });
}
async function createSalesOrderController(req, res) {
    (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.body.branchId);
    const data = await (0, sales_orders_service_1.createSalesOrder)(req.auth.activeOrganizationId, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 201, "Sales order created successfully", withOrderView(data));
}
async function getSalesOrderController(req, res) {
    const data = await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order fetched successfully", withOrderView(data));
}
async function updateSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    // A body-supplied branchId would move the order to a different branch — validate that target
    // too, not just where it currently lives.
    if (req.body.branchId) {
        (0, branchAccess_1.assertBranchAccessOrThrow)(req.membership?.branchAccess, req.body.branchId);
    }
    const data = await (0, sales_orders_service_1.updateSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order updated successfully", withOrderView(data));
}
async function confirmSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.confirmSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order confirmed successfully", withOrderView(data));
}
async function rejectSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.rejectSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body.rejectionReason);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order rejected successfully", withOrderView(data));
}
async function cancelSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.cancelSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order cancelled successfully", withOrderView(data));
}
async function deliverSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.deliverSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order delivered successfully", withOrderView(data));
}
async function markSalesOrderReadyController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.markSalesOrderReady)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, {
        mode: req.body?.dispatchMode,
        driverId: req.body?.driverId,
    });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Sales order marked ready successfully", withOrderView(data));
}
async function dispatchSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.dispatchSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, {
        mode: req.body.dispatchMode,
        driverId: req.body.driverId,
    });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Driver dispatch updated", withOrderView(data));
}
async function assignDriverToSalesOrderController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.assignDriverToSalesOrder)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body.driverId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Driver assigned successfully", withOrderView(data));
}
async function proposePartialFulfilmentController(req, res) {
    await assertCanAccessOrder(req, req.auth.activeOrganizationId, req.params.id);
    const data = await (0, sales_orders_service_1.proposePartialFulfilment)(req.auth.activeOrganizationId, req.params.id, req.auth.userId, req.body);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Revised order sent to the customer for approval", withOrderView(data));
}
