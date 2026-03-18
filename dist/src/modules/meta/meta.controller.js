"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupportedLanguagesController = getSupportedLanguagesController;
exports.getLocalizationContextController = getLocalizationContextController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const localization_1 = require("../../utils/localization");
async function getSupportedLanguagesController(_req, res) {
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Supported languages fetched successfully", {
        items: localization_1.SUPPORTED_LANGUAGE_CODES,
    });
}
async function getLocalizationContextController(req, res) {
    const localeContext = await (0, localization_1.resolveLocaleContext)(req);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Localization context fetched successfully", {
        requestedLanguage: localeContext.requestedLanguage,
        resolvedLanguage: localeContext.resolvedLanguage,
        orgDefaultLanguage: localeContext.orgDefaultLanguage,
        userPreferredLanguage: localeContext.userPreferredLanguage,
    });
}
