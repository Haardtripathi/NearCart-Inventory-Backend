import { NotificationLogType } from "@prisma/client";
import { z } from "zod";

import { strictBooleanQueryParam } from "../../utils/validation";

export const notificationLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: strictBooleanQueryParam,
  type: z.nativeEnum(NotificationLogType).optional(),
});
