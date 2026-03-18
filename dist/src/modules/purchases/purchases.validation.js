"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePurchaseSchema = exports.createPurchaseSchema = exports.purchaseQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
const purchaseItemSchema = zod_1.z.object({
    productId: validation_1.trimmedString,
    variantId: validation_1.trimmedString,
    quantity: validation_1.decimalInputSchema,
    unitCost: validation_1.decimalInputSchema,
    taxRate: validation_1.decimalInputSchema.optional(),
    discountAmount: validation_1.decimalInputSchema.optional(),
    batchNumber: validation_1.optionalTrimmedString,
    expiryDate: validation_1.optionalDateInputSchema,
    metadata: zod_1.z.unknown().optional(),
});
exports.purchaseQuerySchema = validation_1.paginationQuerySchema.extend({
    branchId: validation_1.optionalTrimmedString,
    supplierId: validation_1.optionalTrimmedString,
    status: zod_1.z.nativeEnum(client_1.PurchaseReceiptStatus).optional(),
});
exports.createPurchaseSchema = zod_1.z.object({
    branchId: validation_1.trimmedString,
    supplierId: validation_1.optionalTrimmedString,
    receiptNumber: validation_1.optionalTrimmedString,
    invoiceDate: validation_1.optionalDateInputSchema,
    receivedAt: validation_1.optionalDateInputSchema,
    notes: validation_1.optionalTrimmedString,
    items: zod_1.z.array(purchaseItemSchema).min(1),
});
exports.updatePurchaseSchema = zod_1.z.object({
    branchId: validation_1.optionalTrimmedString,
    supplierId: validation_1.optionalTrimmedString,
    receiptNumber: validation_1.optionalTrimmedString,
    invoiceDate: validation_1.optionalDateInputSchema,
    receivedAt: validation_1.optionalDateInputSchema,
    notes: validation_1.optionalTrimmedString,
    items: zod_1.z.array(purchaseItemSchema).min(1).optional(),
});
