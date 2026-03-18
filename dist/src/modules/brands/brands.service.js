"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBrands = listBrands;
exports.createBrand = createBrand;
exports.updateBrand = updateBrand;
exports.deleteBrand = deleteBrand;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const pagination_1 = require("../../utils/pagination");
const slug_1 = require("../../utils/slug");
const audit_service_1 = require("../audit/audit.service");
async function listBrands(organizationId, query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = {
        organizationId,
        deletedAt: null,
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.search
            ? {
                OR: [
                    { name: { contains: query.search, mode: "insensitive" } },
                    { slug: { contains: query.search, mode: "insensitive" } },
                ],
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.brand.findMany({
            where,
            orderBy: { name: "asc" },
            skip,
            take: limit,
        }),
        prisma_1.prisma.brand.count({ where }),
    ]);
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createBrand(organizationId, actorUserId, input) {
    const brand = await prisma_1.prisma.brand.create({
        data: {
            organizationId,
            name: input.name.trim(),
            slug: (0, slug_1.slugify)(input.slug ?? input.name),
            isActive: input.isActive ?? true,
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "Brand",
        entityId: brand.id,
        after: brand,
    });
    return brand;
}
async function updateBrand(organizationId, brandId, actorUserId, input) {
    const existing = await prisma_1.prisma.brand.findFirst({
        where: {
            id: brandId,
            organizationId,
            deletedAt: null,
        },
    });
    if (!existing) {
        throw ApiError_1.ApiError.notFound("Brand not found");
    }
    const updated = await prisma_1.prisma.brand.update({
        where: { id: brandId },
        data: {
            ...(input.name ? { name: input.name.trim() } : {}),
            ...(input.slug ? { slug: (0, slug_1.slugify)(input.slug) } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.UPDATE,
        entityType: "Brand",
        entityId: updated.id,
        before: existing,
        after: updated,
    });
    return updated;
}
async function deleteBrand(organizationId, brandId, actorUserId) {
    const existing = await prisma_1.prisma.brand.findFirst({
        where: {
            id: brandId,
            organizationId,
            deletedAt: null,
        },
    });
    if (!existing) {
        throw ApiError_1.ApiError.notFound("Brand not found");
    }
    const deleted = await prisma_1.prisma.brand.update({
        where: { id: brandId },
        data: {
            isActive: false,
            deletedAt: new Date(),
        },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.DELETE,
        entityType: "Brand",
        entityId: deleted.id,
        before: existing,
        after: deleted,
    });
    return deleted;
}
