"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapSuperAdmin = bootstrapSuperAdmin;
exports.login = login;
exports.getMe = getMe;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const env_1 = require("../../config/env");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const jwt_1 = require("../../utils/jwt");
const audit_service_1 = require("../audit/audit.service");
function buildTokenPayload(input) {
    return (0, jwt_1.signAuthToken)(input);
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
            email: input.email.trim().toLowerCase(),
            passwordHash,
            platformRole: client_1.UserRole.SUPER_ADMIN,
        },
        select: {
            id: true,
            fullName: true,
            email: true,
            platformRole: true,
            createdAt: true,
        },
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
async function login(input, meta) {
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            email: input.email.trim().toLowerCase(),
        },
        include: {
            memberships: {
                include: {
                    organization: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            status: true,
                            deletedAt: true,
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
        throw ApiError_1.ApiError.unauthorized("Invalid email or password");
    }
    const passwordMatches = await bcrypt_1.default.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
        throw ApiError_1.ApiError.unauthorized("Invalid email or password");
    }
    const activeMemberships = user.memberships.filter((membership) => membership.organization.deletedAt === null);
    let activeOrganizationId = null;
    let role = user.platformRole === client_1.UserRole.SUPER_ADMIN ? client_1.UserRole.SUPER_ADMIN : null;
    if (user.platformRole !== client_1.UserRole.SUPER_ADMIN) {
        const membership = (input.organizationId
            ? activeMemberships.find((item) => item.organizationId === input.organizationId)
            : activeMemberships.find((item) => item.isDefault) ?? activeMemberships[0]) ?? null;
        if (!membership) {
            throw ApiError_1.ApiError.forbidden("No organization membership found for this user");
        }
        activeOrganizationId = membership.organizationId;
        role = membership.role;
    }
    if (role === null) {
        throw ApiError_1.ApiError.forbidden("Unable to determine role for this user");
    }
    await prisma_1.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });
    const token = buildTokenPayload({
        userId: user.id,
        activeOrganizationId,
        role,
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId: activeOrganizationId,
        actorUserId: user.id,
        action: client_1.AuditAction.LOGIN,
        entityType: "User",
        entityId: user.id,
        meta: {
            activeOrganizationId,
            role,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    });
    return {
        token,
        user: {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            platformRole: user.platformRole,
            lastLoginAt: user.lastLoginAt,
        },
        activeOrganizationId,
        role,
        memberships: activeMemberships.map((membership) => ({
            id: membership.id,
            organizationId: membership.organizationId,
            role: membership.role,
            isDefault: membership.isDefault,
            organization: membership.organization,
        })),
    };
}
async function getMe(userId, activeOrganizationId, role) {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        include: {
            memberships: {
                include: {
                    organization: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            status: true,
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
    return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        isActive: user.isActive,
        platformRole: user.platformRole,
        activeOrganizationId,
        role,
        memberships: user.memberships.map((membership) => ({
            id: membership.id,
            organizationId: membership.organizationId,
            role: membership.role,
            isDefault: membership.isDefault,
            branchAccess: membership.branchAccess,
            organization: membership.organization,
        })),
    };
}
