"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireOrganizationContext = requireOrganizationContext;
const client_1 = require("@prisma/client");
const prisma_1 = require("../config/prisma");
const ApiError_1 = require("../utils/ApiError");
async function requireOrganizationContext(req, _res, next) {
    if (!req.auth) {
        return next(ApiError_1.ApiError.unauthorized());
    }
    const headerOrgId = typeof req.headers["x-organization-id"] === "string" ? req.headers["x-organization-id"] : undefined;
    const organizationId = headerOrgId ?? req.auth.activeOrganizationId;
    if (!organizationId) {
        return next(ApiError_1.ApiError.badRequest("Organization context is required"));
    }
    if (req.auth.role === client_1.UserRole.SUPER_ADMIN) {
        const organization = await prisma_1.prisma.organization.findFirst({
            where: {
                id: organizationId,
                deletedAt: null,
            },
            select: { id: true },
        });
        if (!organization) {
            return next(ApiError_1.ApiError.notFound("Organization not found"));
        }
        req.auth = {
            ...req.auth,
            activeOrganizationId: organizationId,
        };
        return next();
    }
    const membership = await prisma_1.prisma.organizationMembership.findFirst({
        where: {
            userId: req.auth.userId,
            organizationId,
            organization: {
                deletedAt: null,
            },
            user: {
                isActive: true,
            },
        },
    });
    if (!membership) {
        return next(ApiError_1.ApiError.forbidden("You do not belong to the selected organization"));
    }
    req.membership = membership;
    req.auth = {
        ...req.auth,
        activeOrganizationId: organizationId,
        role: membership.role,
    };
    next();
}
