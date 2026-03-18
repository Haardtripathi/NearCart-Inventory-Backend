import { AuditAction } from "@prisma/client";
import { z } from "zod";

import { paginationQuerySchema, optionalTrimmedString } from "../../utils/validation";

export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.nativeEnum(AuditAction).optional(),
  entityType: optionalTrimmedString,
});
