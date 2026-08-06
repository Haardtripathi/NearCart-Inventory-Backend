import type { Request, Response } from "express";
import type { NotificationLogType } from "@prisma/client";

import { sendSuccess } from "../../utils/ApiResponse";
import {
  listNotificationLogs,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.service";

export async function listNotificationLogsController(req: Request, res: Response) {
  const organizationId = req.auth!.activeOrganizationId!;
  const query = req.query as unknown as {
    page: number;
    limit: number;
    unreadOnly?: boolean;
    type?: NotificationLogType;
  };

  const data = await listNotificationLogs(organizationId, query);
  return sendSuccess(res, 200, "Notifications fetched successfully", data);
}

export async function markNotificationReadController(req: Request, res: Response) {
  const organizationId = req.auth!.activeOrganizationId!;
  const data = await markNotificationRead(organizationId, req.params.id!);
  return sendSuccess(res, 200, "Notification marked as read", data);
}

export async function markAllNotificationsReadController(req: Request, res: Response) {
  const organizationId = req.auth!.activeOrganizationId!;
  const data = await markAllNotificationsRead(organizationId);
  return sendSuccess(res, 200, "All notifications marked as read", data);
}
