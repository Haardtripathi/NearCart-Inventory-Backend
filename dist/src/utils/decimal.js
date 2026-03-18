"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Decimal = void 0;
exports.toDecimal = toDecimal;
exports.decimalMax = decimalMax;
const client_1 = require("@prisma/client");
exports.Decimal = client_1.Prisma.Decimal;
function toDecimal(value) {
    return new client_1.Prisma.Decimal(value ?? 0);
}
function decimalMax(...values) {
    return values.map((value) => toDecimal(value)).reduce((acc, current) => {
        return current.greaterThan(acc) ? current : acc;
    }, new client_1.Prisma.Decimal(0));
}
