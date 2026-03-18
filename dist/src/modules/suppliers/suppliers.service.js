"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSuppliers = listSuppliers;
exports.createSupplier = createSupplier;
exports.getSupplierById = getSupplierById;
exports.updateSupplier = updateSupplier;
exports.deleteSupplier = deleteSupplier;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const json_1 = require("../../utils/json");
const pagination_1 = require("../../utils/pagination");
const audit_service_1 = require("../audit/audit.service");
async function listSuppliers(organizationId, query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        deletedAt: null,
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.search
            ? {
                OR: [
                    { name: { contains: query.search, mode: "insensitive" } },
                    { code: { contains: query.search, mode: "insensitive" } },
                    { phone: { contains: query.search, mode: "insensitive" } },
                    { email: { contains: query.search, mode: "insensitive" } },
                ],
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.supplier.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma_1.prisma.supplier.count({ where }),
    ]);
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createSupplier(organizationId, actorUserId, input) {
    const supplier = await prisma_1.prisma.supplier.create({
        data: {
            organizationId,
            name: input.name.trim(),
            code: input.code ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            taxNumber: input.taxNumber ?? null,
            address: (0, json_1.toNullableJsonValue)(input.address),
            notes: input.notes ?? null,
            isActive: input.isActive ?? true,
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "Supplier",
        entityId: supplier.id,
        after: supplier,
    });
    return supplier;
}
async function getSupplierById(organizationId, supplierId) {
    const supplier = await prisma_1.prisma.supplier.findFirst({
        where: {
            id: supplierId,
            organizationId,
            deletedAt: null,
        },
    });
    if (!supplier) {
        throw ApiError_1.ApiError.notFound("Supplier not found");
    }
    return supplier;
}
async function updateSupplier(organizationId, supplierId, actorUserId, input) {
    const existing = await getSupplierById(organizationId, supplierId);
    const updated = await prisma_1.prisma.supplier.update({
        where: { id: supplierId },
        data: {
            ...(input.name ? { name: input.name.trim() } : {}),
            ...(input.code !== undefined ? { code: input.code || null } : {}),
            ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
            ...(input.email !== undefined ? { email: input.email || null } : {}),
            ...(input.taxNumber !== undefined ? { taxNumber: input.taxNumber || null } : {}),
            ...(input.address !== undefined ? { address: (0, json_1.toNullableJsonValue)(input.address) } : {}),
            ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "Supplier",
        entityId: updated.id,
        before: existing,
        after: updated,
    });
    return updated;
}
async function deleteSupplier(organizationId, supplierId, actorUserId) {
    const existing = await getSupplierById(organizationId, supplierId);
    const deleted = await prisma_1.prisma.supplier.update({
        where: { id: supplierId },
        data: {
            isActive: false,
            deletedAt: new Date(),
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.DELETE,
        entityType: "Supplier",
        entityId: deleted.id,
        before: existing,
        after: deleted,
    });
    return deleted;
}
