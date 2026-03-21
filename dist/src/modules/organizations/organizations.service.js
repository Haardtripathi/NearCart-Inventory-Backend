"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrganizationWithResolvedOwner = createOrganizationWithResolvedOwner;
exports.createOrganization = createOrganization;
exports.getMyOrganizations = getMyOrganizations;
exports.getOrganizationById = getOrganizationById;
exports.addIndustryToOrganization = addIndustryToOrganization;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const userActionTokens_1 = require("../../utils/userActionTokens");
const slug_1 = require("../../utils/slug");
const guards_1 = require("../../utils/guards");
const json_1 = require("../../utils/json");
const branchCode_1 = require("../../utils/branchCode");
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
async function assertOrganizationManageAccess(requesterUserId, requesterRole, organizationId) {
    if (requesterRole === client_1.UserRole.SUPER_ADMIN) {
        return;
    }
    const membership = await prisma_1.prisma.organizationMembership.findFirst({
        where: {
            userId: requesterUserId,
            organizationId,
            status: client_1.MembershipStatus.ACTIVE,
            user: {
                isActive: true,
            },
        },
        select: {
            role: true,
        },
    });
    if (!membership || membership.role !== client_1.UserRole.ORG_ADMIN) {
        throw ApiError_1.ApiError.forbidden("Only org admins can update organization industries");
    }
}
async function resolveOrganizationOwner(tx, currentUserId, currentRole, input) {
    if (currentRole !== client_1.UserRole.SUPER_ADMIN) {
        const currentUser = await tx.user.findUnique({
            where: { id: currentUserId },
            select: {
                id: true,
                fullName: true,
                email: true,
                preferredLanguage: true,
                isActive: true,
                passwordHash: true,
                passwordSetupRequired: true,
            },
        });
        if (!currentUser) {
            throw ApiError_1.ApiError.notFound("Owner user not found");
        }
        return {
            owner: currentUser,
            requiresAccountSetup: false,
        };
    }
    if (input.ownerUserId) {
        const owner = await tx.user.findUnique({
            where: { id: input.ownerUserId },
            select: {
                id: true,
                fullName: true,
                email: true,
                preferredLanguage: true,
                isActive: true,
                passwordHash: true,
                passwordSetupRequired: true,
            },
        });
        if (!owner) {
            throw ApiError_1.ApiError.notFound("Owner user not found");
        }
        if (!owner.isActive) {
            throw ApiError_1.ApiError.conflict("Selected owner account is inactive");
        }
        return {
            owner,
            requiresAccountSetup: !owner.passwordHash,
        };
    }
    if (input.owner) {
        const email = normalizeEmail(input.owner.email);
        const existingOwner = await tx.user.findUnique({
            where: {
                email,
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                preferredLanguage: true,
                isActive: true,
                passwordHash: true,
                passwordSetupRequired: true,
            },
        });
        if (existingOwner) {
            if (!existingOwner.isActive) {
                throw ApiError_1.ApiError.conflict("Selected owner account is inactive");
            }
            if (!existingOwner.passwordHash) {
                const updatedOwner = await tx.user.update({
                    where: {
                        id: existingOwner.id,
                    },
                    data: {
                        fullName: input.owner.fullName.trim(),
                        preferredLanguage: input.owner.preferredLanguage ?? existingOwner.preferredLanguage,
                        passwordSetupRequired: true,
                    },
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        preferredLanguage: true,
                        isActive: true,
                        passwordHash: true,
                        passwordSetupRequired: true,
                    },
                });
                return {
                    owner: updatedOwner,
                    requiresAccountSetup: true,
                };
            }
            return {
                owner: existingOwner,
                requiresAccountSetup: false,
            };
        }
        const createdOwner = await tx.user.create({
            data: {
                fullName: input.owner.fullName.trim(),
                email,
                preferredLanguage: input.owner.preferredLanguage ?? client_1.LanguageCode.EN,
                isActive: true,
                passwordSetupRequired: true,
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                preferredLanguage: true,
                isActive: true,
                passwordHash: true,
                passwordSetupRequired: true,
            },
        });
        return {
            owner: createdOwner,
            requiresAccountSetup: true,
        };
    }
    const currentUser = await tx.user.findUnique({
        where: { id: currentUserId },
        select: {
            id: true,
            fullName: true,
            email: true,
            preferredLanguage: true,
            isActive: true,
            passwordHash: true,
            passwordSetupRequired: true,
        },
    });
    if (!currentUser) {
        throw ApiError_1.ApiError.notFound("Owner user not found");
    }
    return {
        owner: currentUser,
        requiresAccountSetup: false,
    };
}
async function createOrganizationWithResolvedOwner(tx, input, options) {
    const ownerMembershipCount = await tx.organizationMembership.count({
        where: {
            userId: options.owner.id,
        },
    });
    const organization = await tx.organization.create({
        data: {
            name: input.name.trim(),
            slug: (0, slug_1.slugify)(input.slug ?? input.name),
            legalName: input.legalName ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            status: input.status ?? client_1.OrganizationStatus.ACTIVE,
            currencyCode: input.currencyCode ?? "INR",
            timezone: input.timezone ?? "Asia/Kolkata",
            defaultLanguage: input.defaultLanguage ?? client_1.LanguageCode.EN,
            enabledLanguages: input.enabledLanguages ?? [client_1.LanguageCode.EN, client_1.LanguageCode.HI],
            settings: (0, json_1.toNullableJsonValue)(input.settings),
        },
    });
    await tx.organizationIndustryConfig.create({
        data: {
            organizationId: organization.id,
            industryId: options.primaryIndustry.id,
            isPrimary: true,
            enabledFeatures: (0, json_1.toJsonValue)(input.enabledFeatures ?? options.primaryIndustry.defaultFeatures),
            customSettings: (0, json_1.toNullableJsonValue)(input.customSettings ?? options.primaryIndustry.defaultSettings),
        },
    });
    let firstBranchCode = input.firstBranch.code?.trim();
    if (!firstBranchCode) {
        firstBranchCode = await (0, branchCode_1.generateUniqueBranchCode)(async (candidateCode) => {
            const existingBranch = await tx.branch.findFirst({
                where: {
                    organizationId: organization.id,
                    code: candidateCode,
                    deletedAt: null,
                },
                select: {
                    id: true,
                },
            });
            return Boolean(existingBranch);
        });
    }
    const firstBranch = await tx.branch.create({
        data: {
            organizationId: organization.id,
            code: firstBranchCode,
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
            userId: options.owner.id,
            organizationId: organization.id,
            role: client_1.UserRole.ORG_ADMIN,
            status: options.ownerRequiresAccountSetup ? client_1.MembershipStatus.INVITED : client_1.MembershipStatus.ACTIVE,
            isDefault: ownerMembershipCount === 0,
            invitedByUserId: options.ownerRequiresAccountSetup ? options.actorUserId : null,
            invitedAt: options.ownerRequiresAccountSetup ? new Date() : null,
            acceptedAt: options.ownerRequiresAccountSetup ? null : new Date(),
        },
    });
    const ownerAccessLink = options.ownerRequiresAccountSetup
        ? await (0, userActionTokens_1.createUserActionToken)(tx, {
            userId: options.owner.id,
            createdByUserId: options.actorUserId,
            organizationId: organization.id,
            purpose: client_1.UserActionTokenPurpose.ACCOUNT_SETUP,
            expiresInHours: 24 * 7,
            metadata: {
                organizationId: organization.id,
            },
        })
        : null;
    return {
        organization,
        firstBranch,
        primaryIndustry: options.primaryIndustry,
        ownerUser: {
            id: options.owner.id,
            fullName: options.owner.fullName,
            email: options.owner.email,
            preferredLanguage: options.owner.preferredLanguage,
            requiresAccountSetup: options.ownerRequiresAccountSetup,
        },
        ownerAccessLink: ownerAccessLink
            ? {
                purpose: client_1.UserActionTokenPurpose.ACCOUNT_SETUP,
                token: ownerAccessLink.rawToken,
                url: (0, userActionTokens_1.buildUserActionLink)("/account-setup", ownerAccessLink.rawToken),
                expiresAt: ownerAccessLink.record.expiresAt,
            }
            : null,
    };
}
async function createOrganization(currentUserId, currentRole, input) {
    const industry = await (0, guards_1.assertIndustryExists)(prisma_1.prisma, input.primaryIndustryId);
    return prisma_1.prisma.$transaction(async (tx) => {
        const ownerResolution = await resolveOrganizationOwner(tx, currentUserId, currentRole, input);
        const created = await createOrganizationWithResolvedOwner(tx, input, {
            actorUserId: currentUserId,
            primaryIndustry: industry,
            owner: ownerResolution.owner,
            ownerRequiresAccountSetup: ownerResolution.requiresAccountSetup,
        });
        return {
            ...created.organization,
            firstBranch: created.firstBranch,
            primaryIndustry: created.primaryIndustry,
            ownerUser: created.ownerUser,
            ownerAccessLink: created.ownerAccessLink,
        };
    });
}
async function getMyOrganizations(userId) {
    const memberships = await prisma_1.prisma.organizationMembership.findMany({
        where: {
            userId,
            status: client_1.MembershipStatus.ACTIVE,
            user: {
                isActive: true,
            },
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
                status: client_1.MembershipStatus.ACTIVE,
                user: {
                    isActive: true,
                },
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
async function addIndustryToOrganization(requesterUserId, requesterRole, organizationId, input) {
    await assertOrganizationManageAccess(requesterUserId, requesterRole, organizationId);
    await (0, guards_1.assertOrganizationExists)(prisma_1.prisma, organizationId);
    const industry = await (0, guards_1.assertIndustryExists)(prisma_1.prisma, input.industryId);
    const currentConfigCount = await prisma_1.prisma.organizationIndustryConfig.count({
        where: {
            organizationId,
        },
    });
    return prisma_1.prisma.$transaction(async (tx) => {
        const shouldBePrimary = input.isPrimary ?? currentConfigCount === 0;
        if (shouldBePrimary) {
            await tx.organizationIndustryConfig.updateMany({
                where: {
                    organizationId,
                },
                data: {
                    isPrimary: false,
                },
            });
        }
        const config = await tx.organizationIndustryConfig.upsert({
            where: {
                organizationId_industryId: {
                    organizationId,
                    industryId: industry.id,
                },
            },
            update: {
                isPrimary: shouldBePrimary,
                enabledFeatures: (0, json_1.toJsonValue)(input.enabledFeatures ?? industry.defaultFeatures),
                customSettings: (0, json_1.toNullableJsonValue)(input.customSettings ?? industry.defaultSettings),
            },
            create: {
                organizationId,
                industryId: industry.id,
                isPrimary: shouldBePrimary,
                enabledFeatures: (0, json_1.toJsonValue)(input.enabledFeatures ?? industry.defaultFeatures),
                customSettings: (0, json_1.toNullableJsonValue)(input.customSettings ?? industry.defaultSettings),
            },
            include: {
                industry: true,
            },
        });
        return config;
    });
}
