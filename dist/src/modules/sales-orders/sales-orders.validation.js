"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proposePartialFulfilmentSchema = exports.dispatchSalesOrderSchema = exports.markReadySchema = exports.assignDriverSchema = exports.rejectSalesOrderSchema = exports.updateSalesOrderSchema = exports.createSalesOrderSchema = exports.salesOrderQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
const salesOrderItemSchema = zod_1.z.object({
    productId: validation_1.trimmedString,
    variantId: validation_1.trimmedString,
    quantity: validation_1.decimalInputSchema,
    unitPrice: validation_1.decimalInputSchema.optional(),
    taxRate: validation_1.decimalInputSchema.optional(),
    discountAmount: validation_1.decimalInputSchema.optional(),
    metadata: zod_1.z.unknown().optional(),
});
exports.salesOrderQuerySchema = validation_1.paginationQuerySchema.extend({
    branchId: validation_1.optionalTrimmedString,
    customerId: validation_1.optionalTrimmedString,
    status: zod_1.z.nativeEnum(client_1.SalesOrderStatus).optional(),
    paymentStatus: zod_1.z.nativeEnum(client_1.PaymentStatus).optional(),
    source: zod_1.z.nativeEnum(client_1.OrderSource).optional(),
});
exports.createSalesOrderSchema = zod_1.z.object({
    branchId: validation_1.trimmedString,
    customerId: validation_1.optionalTrimmedString,
    orderNumber: validation_1.optionalTrimmedString,
    source: zod_1.z.nativeEnum(client_1.OrderSource).optional(),
    status: zod_1.z.enum([client_1.SalesOrderStatus.DRAFT, client_1.SalesOrderStatus.PENDING]).optional(),
    paymentStatus: zod_1.z.nativeEnum(client_1.PaymentStatus).optional(),
    notes: validation_1.optionalTrimmedString,
    items: zod_1.z.array(salesOrderItemSchema).min(1),
});
exports.updateSalesOrderSchema = zod_1.z.object({
    branchId: validation_1.optionalTrimmedString,
    customerId: validation_1.optionalTrimmedString,
    source: zod_1.z.nativeEnum(client_1.OrderSource).optional(),
    status: zod_1.z.enum([
        client_1.SalesOrderStatus.DRAFT,
        client_1.SalesOrderStatus.PENDING,
        client_1.SalesOrderStatus.READY,
        client_1.SalesOrderStatus.OUT_FOR_DELIVERY,
    ]).optional(),
    paymentStatus: zod_1.z.nativeEnum(client_1.PaymentStatus).optional(),
    notes: validation_1.optionalTrimmedString,
    items: zod_1.z.array(salesOrderItemSchema).min(1).optional(),
});
exports.rejectSalesOrderSchema = zod_1.z.object({
    rejectionReason: validation_1.trimmedString,
});
exports.assignDriverSchema = zod_1.z.object({
    driverId: validation_1.trimmedString,
});
// Shop-owned drivers (2026-09-24). Both optional on mark-ready: no body = "Let NearCart choose",
// exactly the old behaviour, so the web dashboard and older app builds are unaffected.
const ownDriverRequired = (value) => value.dispatchMode !== client_1.DriverDispatchMode.OWN_DRIVER || Boolean(value.driverId);
exports.markReadySchema = zod_1.z
    .object({
    dispatchMode: zod_1.z.nativeEnum(client_1.DriverDispatchMode).optional(),
    driverId: validation_1.trimmedString.optional(),
})
    .refine(ownDriverRequired, { message: "Pick one of your drivers", path: ["driverId"] });
exports.dispatchSalesOrderSchema = zod_1.z
    .object({
    dispatchMode: zod_1.z.nativeEnum(client_1.DriverDispatchMode),
    driverId: validation_1.trimmedString.optional(),
})
    .refine(ownDriverRequired, { message: "Pick one of your drivers", path: ["driverId"] });
/**
 * Shop-side partial fulfilment: "of what this customer ordered, here is what I can actually
 * supply". `availableQuantity: 0` means "cannot supply this item at all" — which is exactly why
 * this is `nonnegative()` rather than `positive()`. The per-item upper bound (never more than was
 * ordered) and the "at least one item must survive" rule both need the order itself, so they live
 * in the service (see buildPartialFulfilmentProposal), not here.
 */
exports.proposePartialFulfilmentSchema = zod_1.z.object({
    items: zod_1.z
        .array(zod_1.z.object({
        salesOrderItemId: validation_1.trimmedString,
        availableQuantity: zod_1.z.coerce.number().nonnegative(),
    }))
        .min(1),
    note: validation_1.optionalTrimmedString,
});
