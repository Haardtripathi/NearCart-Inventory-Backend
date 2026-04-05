"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchUsersDirectory = searchUsersDirectory;
exports.listOrganizationUsers = listOrganizationUsers;
exports.createOrganizationUser = createOrganizationUser;
exports.updateOrganizationUser = updateOrganizationUser;
exports.generateOrganizationUserAccessLink = generateOrganizationUserAccessLink;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const branchAccess_1 = require("../../utils/branchAccess");
const entityFieldTranslations_1 = require("../../utils/entityFieldTranslations");
const json_1 = require("../../utils/json");
const userActionTokens_1 = require("../../utils/userActionTokens");
const audit_service_1 = require("../audit/audit.service");
const ACCOUNT_SETUP_TOKEN_HOURS = 24 * 7;
const PASSWORD_RESET_TOKEN_HOURS = 24;
const INTERACTIVE_TRANSACTION_OPTIONS = {
    maxWait: 10_000,
    timeout: 30_000,
};
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function assertManageableRole(actorRole, targetRole) {
    if (targetRole === client_1.UserRole.SUPER_ADMIN) {
        throw ApiError_1.ApiError.forbidden("Super admin accounts cannot be created or assigned from this flow");
    }
    if (actorRole === client_1.UserRole.SUPER_ADMIN) {
        return;
    }
    if (actorRole === client_1.UserRole.ORG_ADMIN) {
        if ([client_1.UserRole.ORG_ADMIN, client_1.UserRole.MANAGER, client_1.UserRole.STAFF].includes(targetRole)) {
            return;
        }
    }
    throw ApiError_1.ApiError.forbidden("You do not have permission to manage this role");
}
function serializeAccessLink(link) {
    const pathname = link.purpose === client_1.UserActionTokenPurpose.ACCOUNT_SETUP ? "/account-setup" : "/reset-password";
    return {
        purpose: link.purpose,
        token: link.rawToken,
        url: (0, userActionTokens_1.buildUserActionLink)(pathname, link.rawToken),
        expiresAt: link.expiresAt,
    };
}
async function getMembershipRecord(organizationId, userId) {
    const membership = await prisma_1.prisma.organizationMembership.findFirst({
        where: {
            organizationId,
            userId,
        },
        include: {
            user: {
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    preferredLanguage: true,
                    isActive: true,
                    platformRole: true,
                    passwordHash: true,
                    passwordSetupRequired: true,
                    lastLoginAt: true,
                },
            },
        },
    });
    if (!membership) {
        throw ApiError_1.ApiError.notFound("Organization user not found");
    }
    return membership;
}
async function assertNotRemovingLastActiveOrgAdmin(organizationId, membershipId, currentRole, currentStatus, nextRole, nextStatus) {
    const isCurrentlyActiveAdmin = currentRole === client_1.UserRole.ORG_ADMIN && currentStatus === client_1.MembershipStatus.ACTIVE;
    const remainsActiveAdmin = nextRole === client_1.UserRole.ORG_ADMIN && nextStatus === client_1.MembershipStatus.ACTIVE;
    if (!isCurrentlyActiveAdmin || remainsActiveAdmin) {
        return;
    }
    const remainingActiveOrgAdmins = await prisma_1.prisma.organizationMembership.count({
        where: {
            organizationId,
            id: {
                not: membershipId,
            },
            role: client_1.UserRole.ORG_ADMIN,
            status: client_1.MembershipStatus.ACTIVE,
            user: {
                isActive: true,
            },
        },
    });
    if (remainingActiveOrgAdmins === 0) {
        throw ApiError_1.ApiError.conflict("Each organization needs at least one active org admin");
    }
}
async function resolveBranchMap(organizationId, memberships) {
    const branchIds = Array.from(new Set(memberships.flatMap((membership) => (0, branchAccess_1.normalizeBranchAccess)(membership.branchAccess).branchIds)));
    if (branchIds.length === 0) {
        return new Map();
    }
    const branches = await prisma_1.prisma.branch.findMany({
        where: {
            organizationId,
            id: {
                in: branchIds,
            },
            deletedAt: null,
        },
        select: {
            id: true,
            code: true,
            name: true,
        },
    });
    return new Map(branches.map((branch) => [branch.id, branch]));
}
function serializeMembership(membership, branchMap) {
    const branchAccess = (0, branchAccess_1.normalizeBranchAccess)(membership.branchAccess);
    return {
        id: membership.user.id,
        fullName: membership.user.fullName,
        email: membership.user.email,
        preferredLanguage: membership.user.preferredLanguage,
        isActive: membership.user.isActive,
        platformRole: membership.user.platformRole,
        lastLoginAt: membership.user.lastLoginAt,
        role: membership.role,
        status: membership.status,
        isDefault: membership.isDefault,
        branchAccess,
        accessibleBranches: branchAccess.scope === "ALL"
            ? []
            : branchAccess.branchIds
                .map((branchId) => branchMap.get(branchId))
                .filter(Boolean),
        invitedAt: membership.invitedAt,
        acceptedAt: membership.acceptedAt,
        passwordSetupRequired: membership.user.passwordSetupRequired,
    };
}
async function searchUsersDirectory(search) {
    const query = search?.trim();
    const users = await prisma_1.prisma.user.findMany({
        where: query
            ? {
                OR: [
                    {
                        fullName: {
                            contains: query,
                            mode: "insensitive",
                        },
                    },
                    {
                        email: {
                            contains: query,
                            mode: "insensitive",
                        },
                    },
                ],
            }
            : undefined,
        select: {
            id: true,
            fullName: true,
            email: true,
            platformRole: true,
            preferredLanguage: true,
            isActive: true,
            passwordSetupRequired: true,
            lastLoginAt: true,
            _count: {
                select: {
                    memberships: true,
                },
            },
        },
        orderBy: [{ fullName: "asc" }, { email: "asc" }],
        take: 20,
    });
    return users.map((user) => ({
        ...user,
        membershipCount: user._count.memberships,
    }));
}
async function listOrganizationUsers(organizationId) {
    const memberships = await prisma_1.prisma.organizationMembership.findMany({
        where: {
            organizationId,
        },
        include: {
            user: {
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    preferredLanguage: true,
                    isActive: true,
                    platformRole: true,
                    passwordHash: true,
                    passwordSetupRequired: true,
                    lastLoginAt: true,
                },
            },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    const branchMap = await resolveBranchMap(organizationId, memberships);
    return memberships.map((membership) => serializeMembership(membership, branchMap));
}
async function createOrganizationUser(actorUserId, actorRole, organizationId, input) {
    assertManageableRole(actorRole, input.role);
    const email = normalizeEmail(input.email);
    const normalizedBranchAccess = await (0, branchAccess_1.assertBranchAccessInOrganization)(prisma_1.prisma, organizationId, (0, branchAccess_1.normalizeBranchAccess)(input.branchAccess));
    const existingMembershipByEmail = await prisma_1.prisma.organizationMembership.findFirst({
        where: {
            organizationId,
            user: {
                email,
            },
        },
        select: {
            id: true,
        },
    });
    if (existingMembershipByEmail) {
        throw ApiError_1.ApiError.conflict("This user already belongs to the organization");
    }
    const result = await prisma_1.prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
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
                platformRole: true,
                lastLoginAt: true,
            },
        });
        const user = existingUser ??
            (await tx.user.create({
                data: {
                    fullName: input.fullName.trim(),
                    email,
                    preferredLanguage: input.preferredLanguage ?? client_1.LanguageCode.EN,
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
                    platformRole: true,
                    lastLoginAt: true,
                },
            }));
        if (!existingUser) {
            await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(tx, {
                entityType: "User",
                entityId: user.id,
                fields: [{ fieldKey: "fullName", value: input.fullName }],
            });
        }
        if (existingUser && !existingUser.isActive) {
            await tx.user.update({
                where: {
                    id: existingUser.id,
                },
                data: {
                    isActive: true,
                },
            });
        }
        if (existingUser && !existingUser.passwordHash) {
            await tx.user.update({
                where: {
                    id: existingUser.id,
                },
                data: {
                    fullName: input.fullName.trim(),
                    preferredLanguage: input.preferredLanguage ?? existingUser.preferredLanguage,
                    passwordSetupRequired: true,
                },
            });
            await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(tx, {
                entityType: "User",
                entityId: existingUser.id,
                fields: [{ fieldKey: "fullName", value: input.fullName }],
            });
        }
        const membershipCount = await tx.organizationMembership.count({
            where: {
                userId: user.id,
            },
        });
        const membershipStatus = user.passwordHash ? client_1.MembershipStatus.ACTIVE : client_1.MembershipStatus.INVITED;
        const now = new Date();
        const membership = await tx.organizationMembership.create({
            data: {
                userId: user.id,
                organizationId,
                role: input.role,
                status: membershipStatus,
                isDefault: membershipCount === 0,
                branchAccess: (0, json_1.toNullableJsonValue)(normalizedBranchAccess),
                invitedByUserId: membershipStatus === client_1.MembershipStatus.INVITED ? actorUserId : null,
                invitedAt: membershipStatus === client_1.MembershipStatus.INVITED ? now : null,
                acceptedAt: membershipStatus === client_1.MembershipStatus.ACTIVE ? now : null,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        preferredLanguage: true,
                        isActive: true,
                        platformRole: true,
                        passwordHash: true,
                        passwordSetupRequired: true,
                        lastLoginAt: true,
                    },
                },
            },
        });
        let accessLink = null;
        if (membershipStatus === client_1.MembershipStatus.INVITED) {
            const token = await (0, userActionTokens_1.createUserActionToken)(tx, {
                userId: user.id,
                createdByUserId: actorUserId,
                organizationId,
                purpose: client_1.UserActionTokenPurpose.ACCOUNT_SETUP,
                expiresInHours: ACCOUNT_SETUP_TOKEN_HOURS,
                metadata: {
                    organizationId,
                    membershipId: membership.id,
                },
            });
            accessLink = {
                purpose: client_1.UserActionTokenPurpose.ACCOUNT_SETUP,
                rawToken: token.rawToken,
                expiresAt: token.record.expiresAt,
            };
        }
        await (0, audit_service_1.createAuditLog)(tx, {
            organizationId,
            actorUserId,
            action: client_1.AuditAction.CREATE,
            entityType: "OrganizationMembership",
            entityId: membership.id,
            after: {
                userId: user.id,
                email: user.email,
                role: membership.role,
                status: membership.status,
                branchAccess: normalizedBranchAccess,
            },
        });
        return {
            membership,
            accessLink,
        };
    }, INTERACTIVE_TRANSACTION_OPTIONS);
    const branchMap = await resolveBranchMap(organizationId, [result.membership]);
    return {
        user: serializeMembership(result.membership, branchMap),
        accessLink: result.accessLink ? serializeAccessLink(result.accessLink) : null,
    };
}
async function updateOrganizationUser(actorUserId, actorRole, organizationId, userId, input) {
    const existing = await getMembershipRecord(organizationId, userId);
    const nextRole = input.role ?? existing.role;
    const nextStatus = input.status ?? existing.status;
    assertManageableRole(actorRole, existing.role);
    assertManageableRole(actorRole, nextRole);
    if (nextStatus === client_1.MembershipStatus.ACTIVE && !existing.user.passwordHash) {
        throw ApiError_1.ApiError.conflict("This invited user must complete account setup before activation");
    }
    const normalizedBranchAccess = input.branchAccess !== undefined
        ? await (0, branchAccess_1.assertBranchAccessInOrganization)(prisma_1.prisma, organizationId, (0, branchAccess_1.normalizeBranchAccess)(input.branchAccess))
        : (0, branchAccess_1.normalizeBranchAccess)(existing.branchAccess);
    await assertNotRemovingLastActiveOrgAdmin(organizationId, existing.id, existing.role, existing.status, nextRole, nextStatus);
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        if (input.fullName || input.preferredLanguage) {
            await tx.user.update({
                where: {
                    id: userId,
                },
                data: {
                    ...(input.fullName ? { fullName: input.fullName.trim() } : {}),
                    ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
                },
            });
            await (0, entityFieldTranslations_1.syncEntityFieldTranslations)(tx, {
                entityType: "User",
                entityId: userId,
                fields: [{ fieldKey: "fullName", value: input.fullName ?? existing.user.fullName }],
            });
        }
        const membership = await tx.organizationMembership.update({
            where: {
                id: existing.id,
            },
            data: {
                ...(input.role ? { role: input.role } : {}),
                ...(input.status ? { status: input.status } : {}),
                ...(input.branchAccess !== undefined ? { branchAccess: (0, json_1.toNullableJsonValue)(normalizedBranchAccess) } : {}),
                ...(existing.status !== client_1.MembershipStatus.ACTIVE && nextStatus === client_1.MembershipStatus.ACTIVE
                    ? { acceptedAt: new Date() }
                    : {}),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        preferredLanguage: true,
                        isActive: true,
                        platformRole: true,
                        passwordHash: true,
                        passwordSetupRequired: true,
                        lastLoginAt: true,
                    },
                },
            },
        });
        await (0, audit_service_1.createAuditLog)(tx, {
            organizationId,
            actorUserId,
            action: client_1.AuditAction.UPDATE,
            entityType: "OrganizationMembership",
            entityId: membership.id,
            before: {
                role: existing.role,
                status: existing.status,
                branchAccess: (0, branchAccess_1.normalizeBranchAccess)(existing.branchAccess),
            },
            after: {
                role: membership.role,
                status: membership.status,
                branchAccess: normalizedBranchAccess,
            },
        });
        return membership;
    }, INTERACTIVE_TRANSACTION_OPTIONS);
    const branchMap = await resolveBranchMap(organizationId, [updated]);
    return serializeMembership(updated, branchMap);
}
async function generateOrganizationUserAccessLink(actorUserId, organizationId, userId) {
    const membership = await getMembershipRecord(organizationId, userId);
    const purpose = membership.user.passwordHash
        ? client_1.UserActionTokenPurpose.PASSWORD_RESET
        : client_1.UserActionTokenPurpose.ACCOUNT_SETUP;
    const token = await prisma_1.prisma.$transaction(async (tx) => {
        const created = await (0, userActionTokens_1.createUserActionToken)(tx, {
            userId,
            createdByUserId: actorUserId,
            organizationId,
            purpose,
            expiresInHours: purpose === client_1.UserActionTokenPurpose.ACCOUNT_SETUP ? ACCOUNT_SETUP_TOKEN_HOURS : PASSWORD_RESET_TOKEN_HOURS,
            metadata: {
                organizationId,
                membershipId: membership.id,
            },
        });
        await (0, audit_service_1.createAuditLog)(tx, {
            organizationId,
            actorUserId,
            action: client_1.AuditAction.UPDATE,
            entityType: "UserActionToken",
            entityId: created.record.id,
            after: {
                userId,
                purpose,
                expiresAt: created.record.expiresAt,
            },
        });
        return created;
    });
    return serializeAccessLink({
        purpose,
        rawToken: token.rawToken,
        expiresAt: token.record.expiresAt,
    });
}
