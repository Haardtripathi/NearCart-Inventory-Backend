"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPagination = getPagination;
exports.buildPagination = buildPagination;
const inventory_1 = require("../constants/inventory");
function getPagination(page = inventory_1.DEFAULT_PAGE, limit = inventory_1.DEFAULT_LIMIT) {
    const safePage = Number.isNaN(page) ? inventory_1.DEFAULT_PAGE : Math.max(inventory_1.DEFAULT_PAGE, page);
    const safeLimit = Number.isNaN(limit) ? inventory_1.DEFAULT_LIMIT : Math.min(inventory_1.MAX_LIMIT, Math.max(1, limit));
    return {
        page: safePage,
        limit: safeLimit,
        skip: (safePage - 1) * safeLimit,
    };
}
function buildPagination(page, limit, totalItems) {
    return {
        page,
        limit,
        totalItems,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
    };
}
