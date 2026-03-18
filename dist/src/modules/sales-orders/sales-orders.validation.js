"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectSalesOrderSchema = exports.updateSalesOrderSchema = exports.createSalesOrderSchema = exports.salesOrderQuerySchema = void 0;
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
