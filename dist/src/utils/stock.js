"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableStock = getAvailableStock;
exports.isLowStock = isLowStock;
const decimal_1 = require("./decimal");
function getAvailableStock(onHand, reserved) {
    return (0, decimal_1.toDecimal)(onHand).minus((0, decimal_1.toDecimal)(reserved));
}
function isLowStock(onHand, reorderLevel, minStockLevel) {
    const threshold = (0, decimal_1.decimalMax)(reorderLevel, minStockLevel);
    return (0, decimal_1.toDecimal)(onHand).lessThanOrEqualTo(threshold);
}
