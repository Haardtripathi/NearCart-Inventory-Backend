"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStockTransferSchema = exports.createStockTransferSchema = exports.stockTransferQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
const stockTransferItemSchema = zod_1.z.object({
    productId: validation_1.trimmedString,
    variantId: validation_1.trimmedString,
    quantity: validation_1.decimalInputSchema,
    unitCost: validation_1.decimalInputSchema.optional(),
});
exports.stockTransferQuerySchema = validation_1.paginationQuerySchema.extend({
    fromBranchId: validation_1.optionalTrimmedString,
    toBranchId: validation_1.optionalTrimmedString,
    status: zod_1.z.nativeEnum(client_1.StockTransferStatus).optional(),
});
const stockTransferBaseSchema = zod_1.z.object({
    fromBranchId: validation_1.trimmedString,
    toBranchId: validation_1.trimmedString,
    transferNumber: validation_1.optionalTrimmedString,
    notes: validation_1.optionalTrimmedString,
    items: zod_1.z.array(stockTransferItemSchema).min(1),
});
exports.createStockTransferSchema = stockTransferBaseSchema.refine((input) => input.fromBranchId !== input.toBranchId, {
    message: "Source and destination branch cannot be same",
    path: ["toBranchId"],
});
exports.updateStockTransferSchema = stockTransferBaseSchema.partial().refine((input) => !input.fromBranchId || !input.toBranchId || input.fromBranchId !== input.toBranchId, {
    message: "Source and destination branch cannot be same",
    path: ["toBranchId"],
});
