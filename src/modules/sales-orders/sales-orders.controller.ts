import type { Request, Response } from "express";

import { assertBranchAccessOrThrow, resolveBranchFilter } from "../../utils/branchAccess";
import { sendSuccess } from "../../utils/ApiResponse";
import {
  assignDriverToSalesOrder,
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  deliverSalesOrder,
  getSalesOrderById,
  listSalesOrders,
  markSalesOrderReady,
  rejectSalesOrder,
  updateSalesOrder,
} from "./sales-orders.service";

// The order's branchId isn't known until it's loaded (route params only carry the order id), so
// every action below that mutates/reads a single order first loads it and checks branch access
// against its *actual* branchId before doing anything else — see utils/branchAccess.ts's doc
// comment for the bug this closes (a branch-scoped STAFF/MANAGER could otherwise confirm/reject/
// cancel/deliver another branch's order just by knowing its id). No-op for SUPER_ADMIN and
// ALL-scope callers (assertBranchAccessOrThrow's own no-op cases).
async function assertCanAccessOrder(req: Request, organizationId: string, orderId: string) {
  const order = await getSalesOrderById(organizationId, orderId);
  assertBranchAccessOrThrow(req.membership?.branchAccess, order.branchId);
  return order;
}

export async function listSalesOrdersController(req: Request, res: Response) {
  const branchId = resolveBranchFilter(req.membership?.branchAccess, (req.query as { branchId?: string }).branchId);
  const data = await listSalesOrders(req.auth!.activeOrganizationId!, { ...req.query, branchId } as never);
  return sendSuccess(res, 200, "Sales orders fetched successfully", data);
}

export async function createSalesOrderController(req: Request, res: Response) {
  assertBranchAccessOrThrow(req.membership?.branchAccess, req.body.branchId);
  const data = await createSalesOrder(req.auth!.activeOrganizationId!, req.auth!.userId, req.body);
  return sendSuccess(res, 201, "Sales order created successfully", data);
}

export async function getSalesOrderController(req: Request, res: Response) {
  const data = await assertCanAccessOrder(req, req.auth!.activeOrganizationId!, req.params.id!);
  return sendSuccess(res, 200, "Sales order fetched successfully", data);
}

export async function updateSalesOrderController(req: Request, res: Response) {
  await assertCanAccessOrder(req, req.auth!.activeOrganizationId!, req.params.id!);
  // A body-supplied branchId would move the order to a different branch — validate that target
  // too, not just where it currently lives.
  if (req.body.branchId) {
    assertBranchAccessOrThrow(req.membership?.branchAccess, req.body.branchId);
  }
  const data = await updateSalesOrder(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId, req.body);
  return sendSuccess(res, 200, "Sales order updated successfully", data);
}

export async function confirmSalesOrderController(req: Request, res: Response) {
  await assertCanAccessOrder(req, req.auth!.activeOrganizationId!, req.params.id!);
  const data = await confirmSalesOrder(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Sales order confirmed successfully", data);
}

export async function rejectSalesOrderController(req: Request, res: Response) {
  await assertCanAccessOrder(req, req.auth!.activeOrganizationId!, req.params.id!);
  const data = await rejectSalesOrder(
    req.auth!.activeOrganizationId!,
    req.params.id!,
    req.auth!.userId,
    req.body.rejectionReason,
  );
  return sendSuccess(res, 200, "Sales order rejected successfully", data);
}

export async function cancelSalesOrderController(req: Request, res: Response) {
  await assertCanAccessOrder(req, req.auth!.activeOrganizationId!, req.params.id!);
  const data = await cancelSalesOrder(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Sales order cancelled successfully", data);
}

export async function deliverSalesOrderController(req: Request, res: Response) {
  await assertCanAccessOrder(req, req.auth!.activeOrganizationId!, req.params.id!);
  const data = await deliverSalesOrder(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Sales order delivered successfully", data);
}

export async function markSalesOrderReadyController(req: Request, res: Response) {
  await assertCanAccessOrder(req, req.auth!.activeOrganizationId!, req.params.id!);
  const data = await markSalesOrderReady(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Sales order marked ready successfully", data);
}

export async function assignDriverToSalesOrderController(req: Request, res: Response) {
  await assertCanAccessOrder(req, req.auth!.activeOrganizationId!, req.params.id!);
  const data = await assignDriverToSalesOrder(
    req.auth!.activeOrganizationId!,
    req.params.id!,
    req.auth!.userId,
    req.body.driverId,
  );
  return sendSuccess(res, 200, "Driver assigned successfully", data);
}
