"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapSuperAdmin = bootstrapSuperAdmin;
exports.login = login;
exports.registerOrganizationOwner = registerOrganizationOwner;
exports.completeAccountSetup = completeAccountSetup;
exports.resetPasswordWithToken = resetPasswordWithToken;
exports.changePassword = changePassword;
exports.updateMyPreferences = updateMyPreferences;
exports.getMe = getMe;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const env_1 = require("../../config/env");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const branchAccess_1 = require("../../utils/branchAccess");
const entityFieldTranslations_1 = require("../../utils/entityFieldTranslations");
const jwt_1 = require("../../utils/jwt");
const localization_1 = require("../../utils/localization");
const userActionTokens_1 = require("../../utils/userActionTokens");
const guards_1 = require("../../utils/guards");
const organizations_service_1 = require("../organizations/organizations.service");
const audit_service_1 = require("../audit/audit.service");
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function buildTokenPayload(input) {
    return (0, jwt_1.signAuthToken)(input);
}
function serializeMemberships(memberships, localeContext) {
    return memberships.map((membership) => ({
        id: membership.id,
        organizationId: membership.organizationId,
        role: membership.role,
        isDefault: membership.isDefault,
        branchAccess: (0, branchAccess_1.normalizeBranchAccess)(membership.branchAccess),
        organization: {
            ...membership.organization,
            industries: membership.organization.industryConfigs.map((config) => ({
                ...config,
                industry: (0, localization_1.serializeLocalizedEntity)(config.industry, (0, localization_1.createLocaleContext)({
                    requestedLanguage: localeContext.requestedLanguage,
                    userPreferredLanguage: localeContext.userPreferredLanguage,
                    orgDefaultLanguage: membership.organization.defaultLanguage,
                })),
            })),
        },
    }));
}
async function buildAuthenticatedSession(userId, requestedOrganizationId, localeContext) {
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            id: userId,
        },
        include: {
            memberships: {
                where: {
                    status: client_1.MembershipStatus.ACTIVE,
                    organization: {
                        deletedAt: null,
                    },
                },
                include: {
                    organization: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            email: true,
                            status: true,
                            defaultLanguage: true,
                            industryConfigs: {
                                include: {
                                    industry: {
                                        include: {
                                            translations: {
                                                orderBy: {
                                                    language: "asc",
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                orderBy: {
                    createdAt: "asc",
                },
            },
        },
    });
    if (!user || !user.isActive) {
        throw ApiError_1.ApiError.unauthorized("User is inactive or does not exist");
    }
    let activeOrganizationId = null;
    let role = user.platformRole === client_1.UserRole.SUPER_ADMIN ? client_1.UserRole.SUPER_ADMIN : null;
    if (user.platformRole !== client_1.UserRole.SUPER_ADMIN) {
        const membership = (requestedOrganizationId
            ? user.memberships.find((item) => item.organizationId === requestedOrganizationId)
            : user.memberships.find((item) => item.isDefault) ?? user.memberships[0]) ?? null;
        if (!membership) {
            throw ApiError_1.ApiError.forbidden("No active organization membership found for this user");
        }
        activeOrganizationId = membership.organizationId;
        role = membership.role;
    }
    if (!role) {
        throw ApiError_1.ApiError.forbidden("Unable to determine role for this user");
    }
    const resolvedLocaleContext = localeContext ??
        (0, localization_1.createLocaleContext)({
            userPreferredLanguage: user.preferredLanguage,
        });
    const token = buildTokenPayload({
        userId: user.id,
        activeOrganizationId,
        role,
    });
    return {
        token,
        user: {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            platformRole: user.platformRole,
            preferredLanguage: user.preferredLanguage,
            isActive: user.isActive,
            lastLoginAt: user.lastLoginAt,
        },
        activeOrganizationId,
        role,
        memberships: serializeMemberships(user.memberships, resolvedLocaleContext),
    };
}
async function bootstrapSuperAdmin(input, meta) {
    if (input.secret !== env_1.env.ADMIN_BOOTSTRAP_SECRET) {
        throw ApiError_1.ApiError.unauthorized("Invalid bootstrap secret");
    }
    const existingSuperAdmin = await prisma_1.prisma.user.findFirst({
        where: {
            platformRole: client_1.UserRole.SUPER_ADMIN,
        },
        select: { id: true },
    });
    if (existingSuperAdmin) {
        throw ApiError_1.ApiError.conflict("Super admin already exists");
    }
    const passwordHash = await bcrypt_1.default.hash(input.password, 12);
    const user = await prisma_1.prisma.user.create({
        data: {
            fullName: input.fullName.trim(),
            email: normalizeEmail(input.email),
            passwordHash,
            platformRole: client_1.UserRole.SUPER_ADMIN,
            passwordSetupRequired: false,
            passwordChangedAt: new Date(),
        },
        select: {
            id: true,
            fullName: true,
            email: true,
            platformRole: true,
            preferredLanguage: true,
            createdAt: true,
        },
    });
    await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(prisma_1.prisma, {
        entityType: "User",
        entityId: user.id,
        fields: [{ fieldKey: "fullName", value: input.fullName }],
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        actorUserId: user.id,
        action: client_1.AuditAction.CREATE,
        entityType: "User",
        entityId: user.id,
        after: user,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    });
    return user;
}
async function login(input, meta, localeContext) {
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            email: normalizeEmail(input.email),
        },
        select: {
            id: true,
            isActive: true,
            passwordHash: true,
            passwordSetupRequired: true,
        },
    });
    if (!user || !user.isActive || !user.passwordHash) {
        throw ApiError_1.ApiError.unauthorized(user?.passwordSetupRequired ? "Account setup is required before login" : "Invalid email or password");
    }
    const passwordMatches = await bcrypt_1.default.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
        throw ApiError_1.ApiError.unauthorized("Invalid email or password");
    }
    await prisma_1.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });
    const session = await buildAuthenticatedSession(user.id, input.organizationId ?? null, localeContext);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId: session.activeOrganizationId,
        actorUserId: user.id,
        action: client_1.AuditAction.LOGIN,
        entityType: "User",
        entityId: user.id,
        meta: {
            activeOrganizationId: session.activeOrganizationId,
            role: session.role,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    });
    return session;
}
async function registerOrganizationOwner(input, meta, localeContext) {
    const email = normalizeEmail(input.email);
    const existingUser = await prisma_1.prisma.user.findUnique({
        where: {
            email,
        },
        select: {
            id: true,
        },
    });
    if (existingUser) {
        throw ApiError_1.ApiError.conflict("An account with this email already exists");
    }
    const industry = await (0, guards_1.assertIndustryExists)(prisma_1.prisma, input.primaryIndustryId);
    const passwordHash = await bcrypt_1.default.hash(input.password, 12);
    const created = await prisma_1.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                fullName: input.fullName.trim(),
                email,
                passwordHash,
                preferredLanguage: input.preferredLanguage ?? input.defaultLanguage ?? client_1.LanguageCode.EN,
                isActive: true,
                passwordSetupRequired: false,
                passwordChangedAt: new Date(),
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                preferredLanguage: true,
                passwordHash: true,
                passwordSetupRequired: true,
            },
        });
        await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(tx, {
            entityType: "User",
            entityId: user.id,
            fields: [{ fieldKey: "fullName", value: input.fullName }],
        });
        const organizationInput = {
            name: input.name,
            slug: input.slug,
            legalName: input.legalName,
            phone: input.phone,
            email: input.organizationEmail,
            currencyCode: input.currencyCode,
            timezone: input.timezone,
            defaultLanguage: input.defaultLanguage,
            enabledLanguages: input.enabledLanguages,
            settings: input.settings,
            primaryIndustryId: input.primaryIndustryId,
            enabledFeatures: input.enabledFeatures,
            customSettings: input.customSettings,
            firstBranch: input.firstBranch,
        };
        const organization = await (0, organizations_service_1.createOrganizationWithResolvedOwner)(tx, organizationInput, {
            actorUserId: user.id,
            primaryIndustry: industry,
            owner: user,
            ownerRequiresAccountSetup: false,
        });
        await (0, audit_service_1.createAuditLog)(tx, {
            actorUserId: user.id,
            organizationId: organization.organization.id,
            action: client_1.AuditAction.CREATE,
            entityType: "User",
            entityId: user.id,
            after: {
                id: user.id,
                email: user.email,
            },
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
        });
        return {
            userId: user.id,
            organizationId: organization.organization.id,
        };
    }, {
        maxWait: 10_000,
        timeout: 30_000,
    });
    await prisma_1.prisma.user.update({
        where: {
            id: created.userId,
        },
        data: {
            lastLoginAt: new Date(),
        },
    });
    const session = await buildAuthenticatedSession(created.userId, created.organizationId, localeContext);
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId: created.organizationId,
        actorUserId: created.userId,
        action: client_1.AuditAction.LOGIN,
        entityType: "User",
        entityId: created.userId,
        meta: {
            activeOrganizationId: created.organizationId,
            role: session.role,
            source: "registration",
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    });
    return session;
}
async function completeCredentialFlow(token, purpose, password, meta, localeContext) {
    const tokenRecord = await (0, userActionTokens_1.getUserActionTokenByRawToken)(prisma_1.prisma, token, purpose);
    if (!tokenRecord || !tokenRecord.user.isActive) {
        throw ApiError_1.ApiError.unauthorized("This link is invalid or has expired");
    }
    const passwordHash = await bcrypt_1.default.hash(password, 12);
    const now = new Date();
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: {
                id: tokenRecord.userId,
            },
            data: {
                passwordHash,
                passwordSetupRequired: false,
                passwordChangedAt: now,
                lastLoginAt: now,
            },
        });
        if (purpose === client_1.UserActionTokenPurpose.ACCOUNT_SETUP) {
            await tx.organizationMembership.updateMany({
                where: {
                    userId: tokenRecord.userId,
                    status: client_1.MembershipStatus.INVITED,
                },
                data: {
                    status: client_1.MembershipStatus.ACTIVE,
                    acceptedAt: now,
                },
            });
        }
        await (0, userActionTokens_1.markUserActionTokenUsed)(tx, tokenRecord.id);
        await (0, audit_service_1.createAuditLog)(tx, {
            organizationId: tokenRecord.organizationId,
            actorUserId: tokenRecord.userId,
            action: client_1.AuditAction.UPDATE,
            entityType: "User",
            entityId: tokenRecord.userId,
            after: {
                purpose,
                completedAt: now,
            },
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
        });
    });
    return buildAuthenticatedSession(tokenRecord.userId, tokenRecord.organizationId ?? null, localeContext);
}
async function completeAccountSetup(input, meta, localeContext) {
    return completeCredentialFlow(input.token, client_1.UserActionTokenPurpose.ACCOUNT_SETUP, input.password, meta, localeContext);
}
async function resetPasswordWithToken(input, meta, localeContext) {
    return completeCredentialFlow(input.token, client_1.UserActionTokenPurpose.PASSWORD_RESET, input.password, meta, localeContext);
}
async function changePassword(userId, input) {
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            id: userId,
        },
        select: {
            id: true,
            passwordHash: true,
        },
    });
    if (!user?.passwordHash) {
        throw ApiError_1.ApiError.badRequest("Password is not available for this account");
    }
    const passwordMatches = await bcrypt_1.default.compare(input.currentPassword, user.passwordHash);
    if (!passwordMatches) {
        throw ApiError_1.ApiError.unauthorized("Current password is incorrect");
    }
    const passwordHash = await bcrypt_1.default.hash(input.newPassword, 12);
    await prisma_1.prisma.user.update({
        where: {
            id: userId,
        },
        data: {
            passwordHash,
            passwordSetupRequired: false,
            passwordChangedAt: new Date(),
        },
    });
    return {
        success: true,
    };
}
async function updateMyPreferences(userId, input) {
    const user = await prisma_1.prisma.user.update({
        where: {
            id: userId,
        },
        data: {
            preferredLanguage: input.preferredLanguage,
        },
        select: {
            id: true,
            fullName: true,
            email: true,
            isActive: true,
            platformRole: true,
            preferredLanguage: true,
            lastLoginAt: true,
        },
    });
    return user;
}
async function getMe(userId, activeOrganizationId, role, localeContext) {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        include: {
            memberships: {
                where: {
                    status: client_1.MembershipStatus.ACTIVE,
                    organization: {
                        deletedAt: null,
                    },
                },
                include: {
                    organization: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            email: true,
                            status: true,
                            defaultLanguage: true,
                            industryConfigs: {
                                include: {
                                    industry: {
                                        include: {
                                            translations: {
                                                orderBy: {
                                                    language: "asc",
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                orderBy: {
                    createdAt: "asc",
                },
            },
        },
    });
    if (!user) {
        throw ApiError_1.ApiError.notFound("User not found");
    }
    const resolvedLocaleContext = localeContext ??
        (0, localization_1.createLocaleContext)({
            userPreferredLanguage: user.preferredLanguage,
        });
    return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        isActive: user.isActive,
        platformRole: user.platformRole,
        preferredLanguage: user.preferredLanguage,
        activeOrganizationId,
        role,
        memberships: serializeMemberships(user.memberships, resolvedLocaleContext),
        lastLoginAt: user.lastLoginAt,
    };
}
