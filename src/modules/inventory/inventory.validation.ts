import { StockMovementType } from "@prisma/client";
import { z } from "zod";

import {
  dateInputSchema,
  decimalInputSchema,
  optionalDateInputSchema,
  optionalTrimmedString,
  paginationQuerySchema,
  trimmedString,
} from "../../utils/validation";

export const inventoryBalanceQuerySchema = paginationQuerySchema.extend({
  branchId: optionalTrimmedString,
  productId: optionalTrimmedString,
  variantId: optionalTrimmedString,
  lowStock: z.coerce.boolean().optional(),
});

export const inventoryLedgerQuerySchema = paginationQuerySchema.extend({
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
