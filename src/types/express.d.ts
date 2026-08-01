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
        tokenJti: string;
        tokenExpiresAt: number;
      };
      membership?: OrganizationMembership;
      activeOrganization?: {
        id: string;
        defaultLanguage: LanguageCode;
        enabledLanguages: unknown;
      };
      driverAuth?: {
        driverId: string;
      };
    }
  }
}

export {};
