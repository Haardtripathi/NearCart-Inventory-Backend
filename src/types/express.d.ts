import type { LanguageCode, OrganizationMembership, UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        activeOrganizationId: string | null;
        role: UserRole;
        userPreferredLanguage: LanguageCode | null;
        activeOrganizationDefaultLanguage: LanguageCode | null;
      };
      membership?: OrganizationMembership;
      activeOrganization?: {
        id: string;
        defaultLanguage: LanguageCode;
        enabledLanguages: unknown;
      };
    }
  }
}

export {};
