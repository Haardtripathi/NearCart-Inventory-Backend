"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCustomers = listCustomers;
exports.createCustomer = createCustomer;
exports.getCustomerById = getCustomerById;
exports.updateCustomer = updateCustomer;
exports.deleteCustomer = deleteCustomer;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const json_1 = require("../../utils/json");
const pagination_1 = require("../../utils/pagination");
const audit_service_1 = require("../audit/audit.service");
async function listCustomers(organizationId, query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        deletedAt: null,
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.search
            ? {
                OR: [
                    { name: { contains: query.search, mode: "insensitive" } },
                    { phone: { contains: query.search, mode: "insensitive" } },
                    { email: { contains: query.search, mode: "insensitive" } },
                ],
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.customer.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma_1.prisma.customer.count({ where }),
    ]);
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createCustomer(organizationId, actorUserId, input) {
    const customer = await prisma_1.prisma.customer.create({
        data: {
            organizationId,
            name: input.name.trim(),
            phone: input.phone ?? null,
            email: input.email ?? null,
            address: (0, json_1.toNullableJsonValue)(input.address),
            notes: input.notes ?? null,
            isActive: input.isActive ?? true,
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "Customer",
        entityId: customer.id,
        after: customer,
    });
    return customer;
}
async function getCustomerById(organizationId, customerId) {
    const customer = await prisma_1.prisma.customer.findFirst({
        where: {
            id: customerId,
            organizationId,
            deletedAt: null,
        },
    });
    if (!customer) {
        throw ApiError_1.ApiError.notFound("Customer not found");
    }
    return customer;
}
async function updateCustomer(organizationId, customerId, actorUserId, input) {
    const existing = await getCustomerById(organizationId, customerId);
    const updated = await prisma_1.prisma.customer.update({
        where: { id: customerId },
        data: {
            ...(input.name ? { name: input.name.trim() } : {}),
            ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
            ...(input.email !== undefined ? { email: input.email || null } : {}),
            ...(input.address !== undefined ? { address: (0, json_1.toNullableJsonValue)(input.address) } : {}),
            ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "Customer",
        entityId: updated.id,
        before: existing,
        after: updated,
    });
    return updated;
}
async function deleteCustomer(organizationId, customerId, actorUserId) {
    const existing = await getCustomerById(organizationId, customerId);
    const deleted = await prisma_1.prisma.customer.update({
        where: { id: customerId },
        data: {
            isActive: false,
            deletedAt: new Date(),
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.DELETE,
        entityType: "Customer",
        entityId: deleted.id,
        before: existing,
        after: deleted,
    });
    return deleted;
}
