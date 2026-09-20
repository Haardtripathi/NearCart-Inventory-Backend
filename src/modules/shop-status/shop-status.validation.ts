import { z } from "zod";

import { optionalTrimmedString } from "../../utils/validation";

export const shopStatusQuerySchema = z.object({
  branchId: optionalTrimmedString,
});

// Mirrors NearCart's own updateShopTodayStatusSchema (isOpen + optional free-text reason, 200
// char cap) so a payload that passes here can never bounce off NearCart's validation with a
// confusing proxied 400.
export const updateShopStatusSchema = z.object({
  branchId: optionalTrimmedString,
  isOpen: z.boolean(),
  reason: z.string().trim().max(200).optional(),
});

export type UpdateShopStatusInput = z.infer<typeof updateShopStatusSchema>;
