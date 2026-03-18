"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrganization = createOrganization;
exports.getMyOrganizations = getMyOrganizations;
exports.getOrganizationById = getOrganizationById;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const slug_1 = require("../../utils/slug");
const guards_1 = require("../../utils/guards");
const json_1 = require("../../utils/json");
async function createOrganization(currentUserId, currentRole, input) {
    const industry = await (0, guards_1.assertIndustryExists)(prisma_1.prisma, input.primaryIndustryId);
    const ownerUserId = currentRole === client_1.UserRole.SUPER_ADMIN && input.ownerUserId ? input.ownerUserId : currentUserId;
    const owner = await prisma_1.prisma.user.findUnique({
        where: { id: ownerUserId },
        select: { id: true },
    });
    if (!owner) {
        throw ApiError_1.ApiError.notFound("Owner user not found");
    }
    const ownerMembershipCount = await prisma_1.prisma.organizationMembership.count({
        where: {
            userId: ownerUserId,
        },
    });
    const slug = (0, slug_1.slugify)(input.slug ?? input.name);
    return prisma_1.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
            data: {
                name: input.name.trim(),
                slug,
                legalName: input.legalName ?? null,
                phone: input.phone ?? null,
                email: input.email ?? null,
                status: input.status ?? client_1.OrganizationStatus.ACTIVE,
                currencyCode: input.currencyCode ?? "INR",
                timezone: input.timezone ?? "Asia/Kolkata",
                settings: (0, json_1.toNullableJsonValue)(input.settings),
            },
        });
        await tx.organizationIndustryConfig.create({
            data: {
                organizationId: organization.id,
                industryId: industry.id,
                isPrimary: true,
                enabledFeatures: (0, json_1.toJsonValue)(input.enabledFeatures ?? industry.defaultFeatures),
                customSettings: (0, json_1.toNullableJsonValue)(input.customSettings ?? industry.defaultSettings),
            },
        });
        const firstBranch = await tx.branch.create({
            data: {
                organizationId: organization.id,
                code: input.firstBranch.code.trim(),
                name: input.firstBranch.name.trim(),
                type: input.firstBranch.type,
                phone: input.firstBranch.phone ?? null,
                email: input.firstBranch.email ?? null,
                addressLine1: input.firstBranch.addressLine1 ?? null,
                addressLine2: input.firstBranch.addressLine2 ?? null,
                city: input.firstBranch.city ?? null,
                state: input.firstBranch.state ?? null,
                country: input.firstBranch.country ?? null,
                postalCode: input.firstBranch.postalCode ?? null,
            },
        });
        await tx.organizationMembership.create({
            data: {
                userId: ownerUserId,
                organizationId: organization.id,
                role: client_1.UserRole.ORG_ADMIN,
                isDefault: ownerMembershipCount === 0,
            },
        });
        return {
            ...organization,
            firstBranch,
            primaryIndustry: industry,
        };
    });
}
async function getMyOrganizations(userId) {
    const memberships = await prisma_1.prisma.organizationMembership.findMany({
        where: {
            userId,
            organization: {
                deletedAt: null,
            },
        },
        include: {
            organization: {
                include: {
                    industryConfigs: {
                        include: {
                            industry: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            createdAt: "asc",
        },
    });
    return memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        status: membership.organization.status,
        role: membership.role,
        isDefault: membership.isDefault,
        industries: membership.organization.industryConfigs,
    }));
}
async function getOrganizationById(requesterUserId, requesterRole, organizationId) {
    if (requesterRole !== client_1.UserRole.SUPER_ADMIN) {
        const membership = await prisma_1.prisma.organizationMembership.findFirst({
            where: {
                userId: requesterUserId,
                organizationId,
            },
            select: { id: true },
        });
        if (!membership) {
            throw ApiError_1.ApiError.forbidden("You do not have access to this organization");
        }
    }
    const organization = await prisma_1.prisma.organization.findFirst({
        where: {
            id: organizationId,
            deletedAt: null,
        },
        include: {
            industryConfigs: {
                include: {
                    industry: true,
                },
            },
            branches: {
                where: {
                    deletedAt: null,
                },
                orderBy: {
                    createdAt: "asc",
                },
            },
        },
    });
    if (!organization) {
        throw ApiError_1.ApiError.notFound("Organization not found");
    }
    return organization;
}
