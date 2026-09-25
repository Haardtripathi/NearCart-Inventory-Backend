"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireOrganizationContext = requireOrganizationContext;
exports.attachOrganizationContextIfPresent = attachOrganizationContextIfPresent;
const client_1 = require("@prisma/client");
const prisma_1 = require("../config/prisma");
const ApiError_1 = require("../utils/ApiError");
function resolveHeaderOrActiveOrganizationId(req) {
    const headerOrgId = typeof req.headers["x-organization-id"] === "string" ? req.headers["x-organization-id"] : undefined;
    return headerOrgId ?? req.auth?.activeOrganizationId ?? undefined;
}
/**
 * Re-validates `organizationId` against the caller's CURRENT membership (or, for SUPER_ADMIN, that
 * the org still exists) and refreshes `req.auth`/`req.membership`/`req.activeOrganization` from
 * that fresh read — never trusts the JWT's `activeOrganizationId`/role claims as-is. Shared by both
 * `requireOrganizationContext` (org id mandatory) and `attachOrganizationContextIfPresent` (org id
 * optional) below so the two can't drift into re-validating differently.
 */
async function resolveOrganizationContext(req, organizationId) {
    if (req.auth.role === client_1.UserRole.SUPER_ADMIN) {
        const organization = await prisma_1.prisma.organization.findFirst({
            where: {
                id: organizationId,
                deletedAt: null,
            },
            select: {
                id: true,
                defaultLanguage: true,
                enabledLanguages: true,
            },
        });
        if (!organization) {
            throw ApiError_1.ApiError.notFound("Organization not found");
        }
        req.activeOrganization = organization;
        req.auth = {
            ...req.auth,
            activeOrganizationId: organizationId,
            activeOrganizationDefaultLanguage: organization.defaultLanguage,
        };
        return;
    }
    const membership = await prisma_1.prisma.organizationMembership.findFirst({
        where: {
            userId: req.auth.userId,
            organizationId,
            status: client_1.MembershipStatus.ACTIVE,
            organization: {
                deletedAt: null,
            },
            user: {
                isActive: true,
            },
        },
        include: {
            organization: {
                select: {
                    id: true,
                    defaultLanguage: true,
                    enabledLanguages: true,
                },
            },
        },
    });
    if (!membership) {
        throw ApiError_1.ApiError.forbidden("You do not belong to the selected organization");
    }
    req.membership = membership;
    req.activeOrganization = membership.organization;
    req.auth = {
        ...req.auth,
        activeOrganizationId: organizationId,
        role: membership.role,
        activeOrganizationDefaultLanguage: membership.organization.defaultLanguage,
    };
}
async function requireOrganizationContext(req, _res, next) {
    if (!req.auth) {
        return next(ApiError_1.ApiError.unauthorized());
    }
    const organizationId = resolveHeaderOrActiveOrganizationId(req);
    if (!organizationId) {
        return next(ApiError_1.ApiError.badRequest("Organization context is required"));
    }
    try {
        await resolveOrganizationContext(req, organizationId);
        next();
    }
    catch (error) {
        next(error);
    }
}
/**
 * Same membership re-validation as `requireOrganizationContext`, but organization context is
 * OPTIONAL rather than mandatory — for routes that are legitimately browsable with no org selected
 * at all (master-catalog's read endpoints in particular: a SUPER_ADMIN manages the global catalog
 * with no org in scope, and `resolveRequestedOrganizationId` there already tolerates a null org
 * id). Passes through untouched when no org id resolves, instead of 400ing like the required
 * variant. When an org id IS present, it's re-validated exactly like the required variant — this
 * is what actually closes the bug these routes had: they used to read
 * `req.auth.activeOrganizationId` straight from the JWT for a non-SUPER_ADMIN with no re-check
 * that the membership was still ACTIVE, so a user whose org access was revoked after login could
 * keep seeing that org's "already imported into your org" flags on master-catalog items until
 * their token naturally expired.
 */
async function attachOrganizationContextIfPresent(req, _res, next) {
    if (!req.auth) {
        return next(ApiError_1.ApiError.unauthorized());
    }
    const organizationId = resolveHeaderOrActiveOrganizationId(req);
    if (!organizationId) {
        return next();
    }
    try {
        await resolveOrganizationContext(req, organizationId);
        next();
    }
    catch (error) {
        next(error);
    }
}
