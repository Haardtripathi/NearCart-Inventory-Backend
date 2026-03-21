import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import {
  createOrganizationUser,
  generateOrganizationUserAccessLink,
  listOrganizationUsers,
  searchUsersDirectory,
  updateOrganizationUser,
} from "./users.service";

export async function searchUsersDirectoryController(req: Request, res: Response) {
  const data = await searchUsersDirectory(typeof req.query.search === "string" ? req.query.search : undefined);
  return sendSuccess(res, 200, "Users fetched successfully", data);
}

export async function listOrganizationUsersController(req: Request, res: Response) {
  const data = await listOrganizationUsers(req.auth!.activeOrganizationId!);
  return sendSuccess(res, 200, "Organization users fetched successfully", data);
}

export async function createOrganizationUserController(req: Request, res: Response) {
  const data = await createOrganizationUser(
    req.auth!.userId,
    req.auth!.role,
    req.auth!.activeOrganizationId!,
    req.body,
  );

  return sendSuccess(res, 201, "Organization user created successfully", data);
}

export async function updateOrganizationUserController(req: Request, res: Response) {
  const data = await updateOrganizationUser(
    req.auth!.userId,
    req.auth!.role,
    req.auth!.activeOrganizationId!,
    req.params.id!,
    req.body,
  );

  return sendSuccess(res, 200, "Organization user updated successfully", data);
}

export async function generateOrganizationUserAccessLinkController(req: Request, res: Response) {
  const data = await generateOrganizationUserAccessLink(
    req.auth!.userId,
    req.auth!.activeOrganizationId!,
    req.params.id!,
  );

  return sendSuccess(res, 201, "User access link generated successfully", data);
}
