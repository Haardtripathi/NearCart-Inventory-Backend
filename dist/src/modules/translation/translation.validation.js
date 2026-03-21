"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateItemSchema = void 0;
const zod_1 = require("zod");
exports.translateItemSchema = zod_1.z.object({
    text: zod_1.z.string().trim().min(1, "text is required"),
});
