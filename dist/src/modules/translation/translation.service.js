"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateItemText = translateItemText;
const ApiError_1 = require("../../utils/ApiError");
const libreTranslate_1 = require("../../utils/libreTranslate");
async function translateItemText(text) {
    try {
        return await (0, libreTranslate_1.buildTranslations)(text, "auto");
    }
    catch (error) {
        throw new ApiError_1.ApiError(502, error instanceof Error ? error.message : "Failed to translate text with the local LibreTranslate server");
    }
}
