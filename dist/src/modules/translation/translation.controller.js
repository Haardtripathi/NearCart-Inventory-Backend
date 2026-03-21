"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateItemController = translateItemController;
const translation_service_1 = require("./translation.service");
async function translateItemController(req, res) {
    const translations = await (0, translation_service_1.translateItemText)(req.body.text);
    return res.status(200).json(translations);
}
