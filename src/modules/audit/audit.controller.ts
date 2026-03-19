import type { Request, Response } from "express";
import type { AuditAction } from "@prisma/client";

import { listAuditLogs } from "./audit.service";
import { sendSuccess } from "../../utils/ApiResponse";

export async function getAuditLogs(req: Request, res: Response) {
  const organizationId = req.auth!.activeOrganizationId!;
  const query = req.query as unknown as {
    page: number;
    limit: number;
    action?: AuditAction;
    entityType?: string;
    actor?: string;
    startDate?: Date;
    endDate?: Date;
  };

  const data = await listAuditLogs(organizationId, query);
  return sendSuccess(res, 200, "Audit logs fetched successfully", data);
}
