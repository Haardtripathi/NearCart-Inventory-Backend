"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMAGE_UPLOAD_SCOPES = void 0;
exports.uploadImageToCloudinary = uploadImageToCloudinary;
const cloudinary_1 = require("cloudinary");
const env_1 = require("../../config/env");
const ApiError_1 = require("../../utils/ApiError");
exports.IMAGE_UPLOAD_SCOPES = [
    "general",
    "product",
    "category",
    "brand",
    "supplier",
    "customer",
    "branch",
    "master-catalog-item",
    "master-catalog-category",
];
let configured = false;
function ensureCloudinaryConfigured() {
    if (!env_1.env.CLOUDINARY_CLOUD_NAME || !env_1.env.CLOUDINARY_API_KEY || !env_1.env.CLOUDINARY_API_SECRET) {
        throw new ApiError_1.ApiError(503, "Image upload is not configured on the server");
    }
    if (!configured) {
        cloudinary_1.v2.config({
            cloud_name: env_1.env.CLOUDINARY_CLOUD_NAME,
            api_key: env_1.env.CLOUDINARY_API_KEY,
            api_secret: env_1.env.CLOUDINARY_API_SECRET,
            secure: true,
        });
        configured = true;
    }
}
function sanitizePathSegment(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "") || "general";
}
async function uploadImageToCloudinary({ fileBuffer, originalFilename, scope, ownerId, }) {
    ensureCloudinaryConfigured();
    const folder = [
        env_1.env.CLOUDINARY_UPLOAD_FOLDER,
        sanitizePathSegment(ownerId),
        sanitizePathSegment(scope),
    ].join("/");
    return new Promise((resolve, reject) => {
        const stream = cloudinary_1.v2.uploader.upload_stream({
            folder,
            resource_type: "image",
            unique_filename: true,
            use_filename: true,
            overwrite: false,
        }, (error, result) => {
            if (error || !result?.secure_url || !result.public_id) {
                reject(ApiError_1.ApiError.badRequest("Image upload failed", error));
                return;
            }
            resolve({
                publicId: result.public_id,
                url: result.secure_url,
                width: result.width,
                height: result.height,
                format: result.format,
                bytes: result.bytes,
                originalFilename,
            });
        });
        stream.on("error", (error) => reject(ApiError_1.ApiError.badRequest("Image upload failed", error)));
        stream.end(fileBuffer);
    });
}
