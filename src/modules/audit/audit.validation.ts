import { AuditAction } from "@prisma/client";
import { z } from "zod";

import {
  optionalDateInputSchema,
  optionalTrimmedString,
  paginationQuerySchema,
} from "../../utils/validation";

export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.nativeEnum(AuditAction).optional(),
  entityType: optionalTrimmedString,
  actor: optionalTrimmedString,
  startDate: optionalDateInputSchema,
  endDate: optionalDateInputSchema,
});
