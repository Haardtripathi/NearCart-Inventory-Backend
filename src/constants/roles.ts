import { UserRole } from "@prisma/client";

export const ALL_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ORG_ADMIN,
  UserRole.MANAGER,
  UserRole.STAFF,
] as const;

export const ADMIN_ROLES = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN] as const;
export const USER_MANAGEMENT_ROLES = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN] as const;
export const MANAGER_ROLES = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.MANAGER] as const;
export const WRITE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.MANAGER] as const;
export const READ_WRITE_STAFF_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ORG_ADMIN,
  UserRole.MANAGER,
  UserRole.STAFF,
] as const;
