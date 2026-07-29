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
