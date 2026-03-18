"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = slugify;
function slugify(input) {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}
