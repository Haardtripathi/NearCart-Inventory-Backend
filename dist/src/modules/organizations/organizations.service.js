"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrganizationWithResolvedOwner = createOrganizationWithResolvedOwner;
exports.createOrganization = createOrganization;
exports.getMyOrganizations = getMyOrganizations;
exports.getOrganizationById = getOrganizationById;
exports.addIndustryToOrganization = addIndustryToOrganization;
exports.backfillOrganizationIndustryCatalogDefaults = backfillOrganizationIndustryCatalogDefaults;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const userActionTokens_1 = require("../../utils/userActionTokens");
const slug_1 = require("../../utils/slug");
const guards_1 = require("../../utils/guards");
const entityFieldTranslations_1 = require("../../utils/entityFieldTranslations");
const json_1 = require("../../utils/json");
const branchCode_1 = require("../../utils/branchCode");
const defaultBrandTranslationLanguages = [client_1.LanguageCode.EN, client_1.LanguageCode.HI, client_1.LanguageCode.GU];
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function getEmailSlugPart(email) {
    if (!email) {
        return "";
    }
    return (0, slug_1.slugify)(email.split("@")[0] ?? "");
}
async function generateUniqueOrganizationSlug(tx, input) {
    const requestedSlug = (0, slug_1.slugify)(input.slug ?? "");
    const baseSlug = requestedSlug || (0, slug_1.slugify)(input.name);
    const emailSlug = getEmailSlugPart(input.email ?? input.owner?.email ?? null);
    const candidateBases = Array.from(new Set([baseSlug, emailSlug ? `${baseSlug}-${emailSlug}` : ""]).values()).filter(Boolean);
    for (const candidate of candidateBases) {
        const existing = await tx.organization.findUnique({
            where: {
                slug: candidate,
            },
            select: {
                id: true,
            },
        });
        if (!existing) {
            return candidate;
        }
    }
    const fallbackBase = candidateBases[0] ?? "organization";
    for (let suffix = 2; suffix < 10_000; suffix += 1) {
        const candidate = `${fallbackBase}-${suffix}`;
        const existing = await tx.organization.findUnique({
            where: {
                slug: candidate,
            },
            select: {
                id: true,
            },
        });
        if (!existing) {
            return candidate;
        }
    }
    throw ApiError_1.ApiError.conflict("Unable to generate a unique organization slug");
}
function getMasterCategoryCanonicalFields(category) {
    const englishTranslation = category.translations.find((translation) => translation.language === client_1.LanguageCode.EN);
    const fallbackTranslation = englishTranslation ?? category.translations[0];
    return {
        name: fallbackTranslation?.name ?? category.code,
        description: fallbackTranslation?.description ?? null,
    };
}
async function seedOrganizationCatalogDefaultsForIndustry(tx, organizationId, industryId) {
    const masterCategories = await tx.masterCatalogCategory.findMany({
        where: {
            industryId,
            isActive: true,
        },
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    const masterCategoryById = new Map(masterCategories.map((category) => [category.id, category]));
    const organizationCategoryIdByMasterId = new Map();
    const ensureCategory = async (masterCategoryId) => {
        const cachedCategoryId = organizationCategoryIdByMasterId.get(masterCategoryId);
        if (cachedCategoryId) {
            return cachedCategoryId;
        }
        const masterCategory = masterCategoryById.get(masterCategoryId);
        if (!masterCategory) {
            throw ApiError_1.ApiError.notFound("Master catalog category not found for industry bootstrap");
        }
        const parentId = masterCategory.parentId ? await ensureCategory(masterCategory.parentId) : null;
        const canonicalFields = getMasterCategoryCanonicalFields(masterCategory);
        const existingCategory = await tx.category.findFirst({
            where: {
                organizationId,
                slug: masterCategory.slug,
            },
            select: {
                id: true,
            },
        });
        const category = existingCategory
            ? await tx.category.update({
                where: {
                    id: existingCategory.id,
                },
                data: {
                    parentId,
                    name: canonicalFields.name,
                    description: canonicalFields.description,
                    sortOrder: masterCategory.sortOrder,
                    isActive: true,
                    deletedAt: null,
                    customFields: (0, json_1.toNullableJsonValue)({
                        masterCatalogCategoryId: masterCategory.id,
                        importedFromMasterCatalog: true,
                        importedFromIndustryDefaults: true,
                    }),
                },
            })
            : await tx.category.create({
                data: {
                    organizationId,
                    parentId,
                    name: canonicalFields.name,
                    slug: masterCategory.slug,
                    description: canonicalFields.description,
                    isActive: true,
                    sortOrder: masterCategory.sortOrder,
                    customFields: (0, json_1.toNullableJsonValue)({
                        masterCatalogCategoryId: masterCategory.id,
                        importedFromMasterCatalog: true,
                        importedFromIndustryDefaults: true,
                    }),
                },
            });
        await tx.categoryTranslation.deleteMany({
            where: {
                categoryId: category.id,
            },
        });
        if (masterCategory.translations.length > 0) {
            await tx.categoryTranslation.createMany({
                data: masterCategory.translations.map((translation) => ({
                    categoryId: category.id,
                    language: translation.language,
                    name: translation.name,
                    description: translation.description,
                })),
            });
        }
        organizationCategoryIdByMasterId.set(masterCategoryId, category.id);
        return category.id;
    };
    for (const masterCategory of masterCategories) {
        await ensureCategory(masterCategory.id);
    }
    const distinctBrandNames = Array.from(new Set((await tx.masterCatalogItem.findMany({
        where: {
            industryId,
            isActive: true,
            NOT: {
                defaultBrandName: null,
            },
        },
        select: {
            defaultBrandName: true,
        },
    }))
        .map((item) => item.defaultBrandName?.trim())
        .filter((brandName) => Boolean(brandName))));
    for (const brandName of distinctBrandNames) {
        const existingBrand = await tx.brand.findFirst({
            where: {
                organizationId,
                slug: (0, slug_1.slugify)(brandName),
            },
            select: {
                id: true,
            },
        });
        const brand = existingBrand
            ? await tx.brand.update({
                where: {
                    id: existingBrand.id,
                },
                data: {
                    name: brandName,
                    isActive: true,
                    deletedAt: null,
                },
            })
            : await tx.brand.create({
                data: {
                    organizationId,
                    name: brandName,
                    slug: (0, slug_1.slugify)(brandName),
                    isActive: true,
                },
            });
        await tx.brandTranslation.deleteMany({
            where: {
                brandId: brand.id,
            },
        });
        await tx.brandTranslation.createMany({
            data: defaultBrandTranslationLanguages.map((language) => ({
                brandId: brand.id,
                language,
                name: brandName,
            })),
        });
    }
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
                await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(tx, {
                    entityType: "User",
                    entityId: updatedOwner.id,
                    fields: [{ fieldKey: "fullName", value: input.owner.fullName }],
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
        await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(tx, {
            entityType: "User",
            entityId: createdOwner.id,
            fields: [{ fieldKey: "fullName", value: input.owner.fullName }],
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
    const organizationSlug = await generateUniqueOrganizationSlug(tx, input);
    const organization = await tx.organization.create({
        data: {
            name: input.name.trim(),
            slug: organizationSlug,
            legalName: input.legalName ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            status: input.status ?? client_1.OrganizationStatus.ACTIVE,
            currencyCode: input.currencyCode ?? "INR",
            timezone: input.timezone ?? "Asia/Kolkata",
            defaultLanguage: input.defaultLanguage ?? client_1.LanguageCode.EN,
            enabledLanguages: input.enabledLanguages ?? [client_1.LanguageCode.EN, client_1.LanguageCode.HI, client_1.LanguageCode.GU],
            settings: (0, json_1.toNullableJsonValue)(input.settings),
        },
    });
    await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(tx, {
        entityType: "Organization",
        entityId: organization.id,
        fields: [
            { fieldKey: "name", value: input.name },
            { fieldKey: "legalName", value: input.legalName },
        ],
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
    await seedOrganizationCatalogDefaultsForIndustry(tx, organization.id, options.primaryIndustry.id);
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
    await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(tx, {
        organizationId: organization.id,
        entityType: "Branch",
        entityId: firstBranch.id,
        fields: [
            { fieldKey: "name", value: input.firstBranch.name },
            { fieldKey: "addressLine1", value: input.firstBranch.addressLine1 },
            { fieldKey: "addressLine2", value: input.firstBranch.addressLine2 },
            { fieldKey: "city", value: input.firstBranch.city },
            { fieldKey: "state", value: input.firstBranch.state },
            { fieldKey: "country", value: input.firstBranch.country },
        ],
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
    }, {
        maxWait: 10_000,
        timeout: 30_000,
    });
}
async function getMyOrganizations(userId, requesterRole) {
    if (requesterRole === client_1.UserRole.SUPER_ADMIN) {
        const organizations = await prisma_1.prisma.organization.findMany({
            where: {
                deletedAt: null,
            },
            include: {
                industryConfigs: {
                    include: {
                        industry: true,
                    },
                },
                memberships: {
                    where: {
                        userId,
                        status: client_1.MembershipStatus.ACTIVE,
                        user: {
                            isActive: true,
                        },
                    },
                    select: {
                        role: true,
                        isDefault: true,
                    },
                    take: 1,
                },
            },
            orderBy: {
                createdAt: "asc",
            },
        });
        return organizations.map((organization) => ({
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            email: organization.email,
            status: organization.status,
            role: organization.memberships[0]?.role ?? client_1.UserRole.SUPER_ADMIN,
            isDefault: organization.memberships[0]?.isDefault ?? false,
            industries: organization.industryConfigs,
        }));
    }
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
        email: membership.organization.email,
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
    return {
        ...organization,
        industries: organization.industryConfigs,
    };
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
        await seedOrganizationCatalogDefaultsForIndustry(tx, organizationId, industry.id);
        return config;
    }, {
        maxWait: 10_000,
        timeout: 30_000,
    });
}
async function backfillOrganizationIndustryCatalogDefaults() {
    const configs = await prisma_1.prisma.organizationIndustryConfig.findMany({
        select: {
            organizationId: true,
            industryId: true,
        },
        orderBy: [{ organizationId: "asc" }, { industryId: "asc" }],
    });
    for (const config of configs) {
        await prisma_1.prisma.$transaction(async (tx) => {
            await seedOrganizationCatalogDefaultsForIndustry(tx, config.organizationId, config.industryId);
        }, {
            maxWait: 10_000,
            timeout: 30_000,
        });
    }
    return {
        processed: configs.length,
    };
}
