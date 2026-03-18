import { UserRole } from "@prisma/client";

export interface JwtAuthPayload {
  userId: string;
  activeOrganizationId: string | null;
  role: UserRole;
}
