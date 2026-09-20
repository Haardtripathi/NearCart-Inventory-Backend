import { OrderSource, PaymentStatus, SalesOrderStatus } from "@prisma/client";
import { z } from "zod";

import {
  decimalInputSchema,
  optionalTrimmedString,
  paginationQuerySchema,
  trimmedString,
} from "../../utils/validation";

const salesOrderItemSchema = z.object({
  productId: trimmedString,
  variantId: trimmedString,
  quantity: decimalInputSchema,
  unitPrice: decimalInputSchema.optional(),
  taxRate: decimalInputSchema.optional(),
  discountAmount: decimalInputSchema.optional(),
  metadata: z.unknown().optional(),
});

export const salesOrderQuerySchema = paginationQuerySchema.extend({
  branchId: optionalTrimmedString,
  customerId: optionalTrimmedString,
  status: z.nativeEnum(SalesOrderStatus).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  source: z.nativeEnum(OrderSource).optional(),
});

export const createSalesOrderSchema = z.object({
  branchId: trimmedString,
  customerId: optionalTrimmedString,
  orderNumber: optionalTrimmedString,
  source: z.nativeEnum(OrderSource).optional(),
  status: z.enum([SalesOrderStatus.DRAFT, SalesOrderStatus.PENDING]).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  notes: optionalTrimmedString,
  items: z.array(salesOrderItemSchema).min(1),
});

export const updateSalesOrderSchema = z.object({
  branchId: optionalTrimmedString,
  customerId: optionalTrimmedString,
  source: z.nativeEnum(OrderSource).optional(),
  status: z.enum([
    SalesOrderStatus.DRAFT,
    SalesOrderStatus.PENDING,
    SalesOrderStatus.READY,
    SalesOrderStatus.OUT_FOR_DELIVERY,
  ]).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  notes: optionalTrimmedString,
  items: z.array(salesOrderItemSchema).min(1).optional(),
});

export const rejectSalesOrderSchema = z.object({
  rejectionReason: trimmedString,
});

export const assignDriverSchema = z.object({
  driverId: trimmedString,
});

/**
 * Shop-side partial fulfilment: "of what this customer ordered, here is what I can actually
 * supply". `availableQuantity: 0` means "cannot supply this item at all" — which is exactly why
 * this is `nonnegative()` rather than `positive()`. The per-item upper bound (never more than was
 * ordered) and the "at least one item must survive" rule both need the order itself, so they live
 * in the service (see buildPartialFulfilmentProposal), not here.
 */
export const proposePartialFulfilmentSchema = z.object({
  items: z
    .array(
      z.object({
        salesOrderItemId: trimmedString,
        availableQuantity: z.coerce.number().nonnegative(),
      }),
    )
    .min(1),
  note: optionalTrimmedString,
});
