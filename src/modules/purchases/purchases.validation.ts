import { PurchaseReceiptStatus } from "@prisma/client";
import { z } from "zod";

import {
  decimalInputSchema,
  optionalDateInputSchema,
  optionalTrimmedString,
  paginationQuerySchema,
  trimmedString,
} from "../../utils/validation";

const purchaseItemSchema = z.object({
  productId: trimmedString,
  variantId: trimmedString,
  quantity: decimalInputSchema,
  unitCost: decimalInputSchema,
  taxRate: decimalInputSchema.optional(),
  discountAmount: decimalInputSchema.optional(),
  batchNumber: optionalTrimmedString,
  expiryDate: optionalDateInputSchema,
  metadata: z.unknown().optional(),
});

export const purchaseQuerySchema = paginationQuerySchema.extend({
  branchId: optionalTrimmedString,
  supplierId: optionalTrimmedString,
  status: z.nativeEnum(PurchaseReceiptStatus).optional(),
});

export const createPurchaseSchema = z.object({
  branchId: trimmedString,
  supplierId: optionalTrimmedString,
  receiptNumber: optionalTrimmedString,
  invoiceDate: optionalDateInputSchema,
  receivedAt: optionalDateInputSchema,
  notes: optionalTrimmedString,
  items: z.array(purchaseItemSchema).min(1),
});

export const updatePurchaseSchema = z.object({
  branchId: optionalTrimmedString,
  supplierId: optionalTrimmedString,
  receiptNumber: optionalTrimmedString,
  invoiceDate: optionalDateInputSchema,
  receivedAt: optionalDateInputSchema,
  notes: optionalTrimmedString,
  items: z.array(purchaseItemSchema).min(1).optional(),
});
