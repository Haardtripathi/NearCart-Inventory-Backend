import { StockMovementType } from "@prisma/client";
import { z } from "zod";

import {
  dateInputSchema,
  decimalInputSchema,
  optionalDateInputSchema,
  optionalTrimmedString,
  paginationQuerySchema,
  strictBooleanQueryParam,
  trimmedString,
} from "../../utils/validation";

export const inventoryBalanceQuerySchema = paginationQuerySchema.extend({
  branchId: optionalTrimmedString,
  productId: optionalTrimmedString,
  variantId: optionalTrimmedString,
  // strictBooleanQueryParam (not z.coerce.boolean()): the latter treats the query string
  // "false" as truthy, silently inverting an explicit ?lowStock=false filter.
  lowStock: strictBooleanQueryParam,
  // "id" = stable order for bulk reads that page through every row (the Partner app's stock map):
  // the default most-recently-moved order shifts while stock changes, so a row moved to page 1
  // after page 1 was read would be skipped. Defaults to "recent" (unchanged behaviour).
  sort: z.enum(["recent", "id"]).optional(),
});

export const inventoryLedgerQuerySchema = paginationQuerySchema.extend({
  search: optionalTrimmedString,
  branchId: optionalTrimmedString,
  productId: optionalTrimmedString,
  variantId: optionalTrimmedString,
  movementType: z.nativeEnum(StockMovementType).optional(),
  startDate: optionalDateInputSchema,
  endDate: optionalDateInputSchema,
});

export const createAdjustmentSchema = z.object({
  branchId: trimmedString,
  variantId: trimmedString,
  quantity: decimalInputSchema,
  direction: z.enum(["IN", "OUT"]),
  note: trimmedString,
  unitCost: decimalInputSchema.optional(),
  batchNumber: optionalTrimmedString,
  expiryDate: optionalDateInputSchema,
  manufactureDate: optionalDateInputSchema,
});
