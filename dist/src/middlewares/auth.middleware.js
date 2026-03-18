"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireRoles = requireRoles;
const client_1 = require("@prisma/client");
const prisma_1 = require("../config/prisma");
const ApiError_1 = require("../utils/ApiError");
const jwt_1 = require("../utils/jwt");
async function authenticate(req, _res, next) {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
        return next(ApiError_1.ApiError.unauthorized("Missing or invalid authorization header"));
    }
    try {
        const token = authorization.replace("Bearer ", "").trim();
        const payload = (0, jwt_1.verifyAuthToken)(token);
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: payload.userId },
            select: {
                id: true,
                isActive: true,
                platformRole: true,
            },
        });
        if (!user || !user.isActive) {
            throw ApiError_1.ApiError.unauthorized("User is inactive or does not exist");
        }
        req.auth = {
            userId: payload.userId,
            activeOrganizationId: payload.activeOrganizationId,
            role: user.platformRole === client_1.UserRole.SUPER_ADMIN ? client_1.UserRole.SUPER_ADMIN : payload.role,
        };
        next();
    }
    catch (error) {
        next(error instanceof ApiError_1.ApiError ? error : ApiError_1.ApiError.unauthorized("Invalid or expired token"));
    }
}
function requireRoles(...roles) {
    return (req, _res, next) => {
        if (!req.auth) {
            return next(ApiError_1.ApiError.unauthorized());
        }
        if (!roles.includes(req.auth.role)) {
            return next(ApiError_1.ApiError.forbidden("You do not have access to this resource"));
        }
        next();
    };
}
