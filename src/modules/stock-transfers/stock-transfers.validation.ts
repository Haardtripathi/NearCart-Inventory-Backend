import { StockTransferStatus } from "@prisma/client";
import { z } from "zod";

import {
  decimalInputSchema,
  optionalTrimmedString,
  paginationQuerySchema,
  trimmedString,
} from "../../utils/validation";

const stockTransferItemSchema = z.object({
  productId: trimmedString,
  variantId: trimmedString,
  quantity: decimalInputSchema,
  unitCost: decimalInputSchema.optional(),
});

export const stockTransferQuerySchema = paginationQuerySchema.extend({
  fromBranchId: optionalTrimmedString,
  toBranchId: optionalTrimmedString,
  status: z.nativeEnum(StockTransferStatus).optional(),
});

const stockTransferBaseSchema = z.object({
  fromBranchId: trimmedString,
  toBranchId: trimmedString,
  transferNumber: optionalTrimmedString,
  notes: optionalTrimmedString,
  items: z.array(stockTransferItemSchema).min(1),
});

export const createStockTransferSchema = stockTransferBaseSchema.refine((input) => input.fromBranchId !== input.toBranchId, {
    message: "Source and destination branch cannot be same",
    path: ["toBranchId"],
  });

export const updateStockTransferSchema = stockTransferBaseSchema.partial().refine(
  (input) => !input.fromBranchId || !input.toBranchId || input.fromBranchId !== input.toBranchId,
  {
    message: "Source and destination branch cannot be same",
    path: ["toBranchId"],
  },
);
