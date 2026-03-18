import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { resolveLocaleContext, SUPPORTED_LANGUAGE_CODES } from "../../utils/localization";

export async function getSupportedLanguagesController(_req: Request, res: Response) {
  return sendSuccess(res, 200, "Supported languages fetched successfully", {
    items: SUPPORTED_LANGUAGE_CODES,
  });
}

export async function getLocalizationContextController(req: Request, res: Response) {
  const localeContext = await resolveLocaleContext(req);

  return sendSuccess(res, 200, "Localization context fetched successfully", {
    requestedLanguage: localeContext.requestedLanguage,
    resolvedLanguage: localeContext.resolvedLanguage,
    orgDefaultLanguage: localeContext.orgDefaultLanguage,
    userPreferredLanguage: localeContext.userPreferredLanguage,
  });
}
