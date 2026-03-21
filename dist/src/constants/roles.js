"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.READ_WRITE_STAFF_ROLES = exports.WRITE_ROLES = exports.MANAGER_ROLES = exports.USER_MANAGEMENT_ROLES = exports.ADMIN_ROLES = exports.ALL_ROLES = void 0;
const client_1 = require("@prisma/client");
exports.ALL_ROLES = [
    client_1.UserRole.SUPER_ADMIN,
    client_1.UserRole.ORG_ADMIN,
    client_1.UserRole.MANAGER,
    client_1.UserRole.STAFF,
];
exports.ADMIN_ROLES = [client_1.UserRole.SUPER_ADMIN, client_1.UserRole.ORG_ADMIN];
exports.USER_MANAGEMENT_ROLES = [client_1.UserRole.SUPER_ADMIN, client_1.UserRole.ORG_ADMIN];
exports.MANAGER_ROLES = [client_1.UserRole.SUPER_ADMIN, client_1.UserRole.ORG_ADMIN, client_1.UserRole.MANAGER];
exports.WRITE_ROLES = [client_1.UserRole.SUPER_ADMIN, client_1.UserRole.ORG_ADMIN, client_1.UserRole.MANAGER];
exports.READ_WRITE_STAFF_ROLES = [
    client_1.UserRole.SUPER_ADMIN,
    client_1.UserRole.ORG_ADMIN,
    client_1.UserRole.MANAGER,
    client_1.UserRole.STAFF,
];
