import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import {
  createCustomer,
  deleteCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
} from "./customers.service";

export async function listCustomersController(req: Request, res: Response) {
  const data = await listCustomers(req.auth!.activeOrganizationId!, req.query as never);
  return sendSuccess(res, 200, "Customers fetched successfully", data);
}

export async function createCustomerController(req: Request, res: Response) {
  const data = await createCustomer(req.auth!.activeOrganizationId!, req.auth!.userId, req.body);
  return sendSuccess(res, 201, "Customer created successfully", data);
}

export async function getCustomerController(req: Request, res: Response) {
  const data = await getCustomerById(req.auth!.activeOrganizationId!, req.params.id!);
  return sendSuccess(res, 200, "Customer fetched successfully", data);
}

export async function updateCustomerController(req: Request, res: Response) {
  const data = await updateCustomer(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId, req.body);
  return sendSuccess(res, 200, "Customer updated successfully", data);
}

export async function deleteCustomerController(req: Request, res: Response) {
  const data = await deleteCustomer(req.auth!.activeOrganizationId!, req.params.id!, req.auth!.userId);
  return sendSuccess(res, 200, "Customer deleted successfully", data);
}
