"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdjustmentSchema = exports.inventoryLedgerQuerySchema = exports.inventoryBalanceQuerySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.inventoryBalanceQuerySchema = validation_1.paginationQuerySchema.extend({
    branchId: validation_1.optionalTrimmedString,
    productId: validation_1.optionalTrimmedString,
    variantId: validation_1.optionalTrimmedString,
    lowStock: zod_1.z.coerce.boolean().optional(),
});
exports.inventoryLedgerQuerySchema = validation_1.paginationQuerySchema.extend({
    branchId: validation_1.optionalTrimmedString,
    productId: validation_1.optionalTrimmedString,
    variantId: validation_1.optionalTrimmedString,
    movementType: zod_1.z.nativeEnum(client_1.StockMovementType).optional(),
    startDate: validation_1.optionalDateInputSchema,
    endDate: validation_1.optionalDateInputSchema,
});
exports.createAdjustmentSchema = zod_1.z.object({
    branchId: validation_1.trimmedString,
    variantId: validation_1.trimmedString,
    quantity: validation_1.decimalInputSchema,
    direction: zod_1.z.enum(["IN", "OUT"]),
    note: validation_1.trimmedString,
    unitCost: validation_1.decimalInputSchema.optional(),
    batchNumber: validation_1.optionalTrimmedString,
    expiryDate: validation_1.optionalDateInputSchema,
    manufactureDate: validation_1.optionalDateInputSchema,
});
