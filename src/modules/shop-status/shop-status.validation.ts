import { z } from "zod";

import { optionalTrimmedString } from "../../utils/validation";

export const shopStatusQuerySchema = z.object({
  branchId: optionalTrimmedString,
});

// Mirrors NearCart's own updateShopTodayStatusSchema (isOpen + optional free-text reason, 200
// char cap) so a payload that passes here can never bounce off NearCart's validation with a
// confusing proxied 400.
// 24h "HH:MM", same rule as NearCart's schema. Optional hours the owner confirms when opening.
const shopClockTime = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");

export const updateShopStatusSchema = z.object({
  branchId: optionalTrimmedString,
  isOpen: z.boolean(),
  reason: z.string().trim().max(200).optional(),
  openingTime: shopClockTime.optional(),
  closingTime: shopClockTime.optional(),
});

export type UpdateShopStatusInput = z.infer<typeof updateShopStatusSchema>;
