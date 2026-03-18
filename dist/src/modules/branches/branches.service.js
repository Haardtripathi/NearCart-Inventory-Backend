"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBranches = listBranches;
exports.createBranch = createBranch;
exports.getBranchById = getBranchById;
exports.updateBranch = updateBranch;
exports.deleteBranch = deleteBranch;
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const pagination_1 = require("../../utils/pagination");
async function listBranches(organizationId, query) {
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
                ],
            }
            : {}),
    };
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.branch.findMany({
            where,
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take: limit,
        }),
        prisma_1.prisma.branch.count({ where }),
    ]);
    return {
        items,
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createBranch(organizationId, input) {
    return prisma_1.prisma.branch.create({
        data: {
            organizationId,
            code: input.code.trim(),
            name: input.name.trim(),
            type: input.type,
            phone: input.phone ?? null,
            email: input.email ?? null,
            addressLine1: input.addressLine1 ?? null,
            addressLine2: input.addressLine2 ?? null,
            city: input.city ?? null,
            state: input.state ?? null,
            country: input.country ?? null,
            postalCode: input.postalCode ?? null,
            isActive: input.isActive ?? true,
        },
    });
}
async function getBranchById(organizationId, branchId) {
    const branch = await prisma_1.prisma.branch.findFirst({
        where: {
            id: branchId,
            organizationId,
            deletedAt: null,
        },
    });
    if (!branch) {
        throw ApiError_1.ApiError.notFound("Branch not found");
    }
    return branch;
}
async function updateBranch(organizationId, branchId, input) {
    await getBranchById(organizationId, branchId);
    return prisma_1.prisma.branch.update({
        where: { id: branchId },
        data: {
            ...(input.code ? { code: input.code.trim() } : {}),
            ...(input.name ? { name: input.name.trim() } : {}),
            ...(input.type ? { type: input.type } : {}),
            ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
            ...(input.email !== undefined ? { email: input.email || null } : {}),
            ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 || null } : {}),
            ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 || null } : {}),
            ...(input.city !== undefined ? { city: input.city || null } : {}),
            ...(input.state !== undefined ? { state: input.state || null } : {}),
            ...(input.country !== undefined ? { country: input.country || null } : {}),
            ...(input.postalCode !== undefined ? { postalCode: input.postalCode || null } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
    });
}
async function deleteBranch(organizationId, branchId) {
    await getBranchById(organizationId, branchId);
    return prisma_1.prisma.branch.update({
        where: { id: branchId },
        data: {
            isActive: false,
            deletedAt: new Date(),
        },
    });
}
