"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toJsonValue = toJsonValue;
exports.toNullableJsonValue = toNullableJsonValue;
const client_1 = require("@prisma/client");
function toJsonValue(value) {
    if (value === undefined) {
        return undefined;
    }
    return value;
}
function toNullableJsonValue(value) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return client_1.Prisma.DbNull;
    }
    return value;
}
