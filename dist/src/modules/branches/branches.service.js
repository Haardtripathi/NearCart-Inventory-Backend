"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBranches = listBranches;
exports.createBranch = createBranch;
exports.getBranchById = getBranchById;
exports.updateBranch = updateBranch;
exports.deleteBranch = deleteBranch;
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const branchCode_1 = require("../../utils/branchCode");
const entityFieldTranslations_1 = require("../../utils/entityFieldTranslations");
const localization_1 = require("../../utils/localization");
const pagination_1 = require("../../utils/pagination");
function serializeBranch(branch, localeContext, translations = []) {
    return {
        ...(0, localization_1.serializeLocalizedEntity)(branch, localeContext),
        displayName: (0, entityFieldTranslations_1.resolveEntityFieldValue)(branch.name, translations, "name", localeContext) ?? branch.name,
    };
}
async function listBranches(organizationId, query, localeContext) {
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
    const translations = await (0, entityFieldTranslations_1.listEntityFieldTranslations)("Branch", items.map((branch) => branch.id), ["name"]);
    const translationsByEntityId = new Map();
    for (const translation of translations) {
        const bucket = translationsByEntityId.get(translation.entityId) ?? [];
        bucket.push(translation);
        translationsByEntityId.set(translation.entityId, bucket);
    }
    return {
        items: items.map((branch) => serializeBranch(branch, localeContext, translationsByEntityId.get(branch.id) ?? [])),
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function createBranch(organizationId, input, localeContext) {
    // Generate code if not provided
    let code = input.code?.trim();
    if (!code) {
        code = await (0, branchCode_1.generateUniqueBranchCode)(async (candidateCode) => {
            const existing = await prisma_1.prisma.branch.findFirst({
                where: {
                    organizationId,
                    code: candidateCode,
                    deletedAt: null,
                },
            });
            return !!existing;
        });
    }
    const branch = await prisma_1.prisma.branch.create({
        data: {
            organizationId,
            code,
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
    await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(prisma_1.prisma, {
        organizationId,
        entityType: "Branch",
        entityId: branch.id,
        fields: [
            { fieldKey: "name", value: input.name },
            { fieldKey: "addressLine1", value: input.addressLine1 },
            { fieldKey: "addressLine2", value: input.addressLine2 },
            { fieldKey: "city", value: input.city },
            { fieldKey: "state", value: input.state },
            { fieldKey: "country", value: input.country },
        ],
    });
    return serializeBranch(branch, localeContext);
}
async function getBranchRecordById(organizationId, branchId) {
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
async function getBranchById(organizationId, branchId, localeContext) {
    const branch = await getBranchRecordById(organizationId, branchId);
    const translations = await (0, entityFieldTranslations_1.listEntityFieldTranslations)("Branch", [branch.id], ["name"]);
    return serializeBranch(branch, localeContext, translations);
}
async function updateBranch(organizationId, branchId, input, localeContext) {
    await getBranchRecordById(organizationId, branchId);
    const branch = await prisma_1.prisma.branch.update({
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
    await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(prisma_1.prisma, {
        organizationId,
        entityType: "Branch",
        entityId: branch.id,
        fields: [
            { fieldKey: "name", value: input.name ?? branch.name },
            { fieldKey: "addressLine1", value: input.addressLine1 ?? branch.addressLine1 },
            { fieldKey: "addressLine2", value: input.addressLine2 ?? branch.addressLine2 },
            { fieldKey: "city", value: input.city ?? branch.city },
            { fieldKey: "state", value: input.state ?? branch.state },
            { fieldKey: "country", value: input.country ?? branch.country },
        ],
    });
    return serializeBranch(branch, localeContext);
}
async function deleteBranch(organizationId, branchId) {
    await getBranchRecordById(organizationId, branchId);
    return prisma_1.prisma.branch.update({
        where: { id: branchId },
        data: {
            isActive: false,
            deletedAt: new Date(),
        },
    });
}
