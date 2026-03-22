import { v2 as cloudinary } from "cloudinary";

import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";

export const IMAGE_UPLOAD_SCOPES = [
  "general",
  "product",
  "category",
  "brand",
  "supplier",
  "customer",
  "branch",
  "master-catalog-item",
  "master-catalog-category",
] as const;

export type ImageUploadScope = (typeof IMAGE_UPLOAD_SCOPES)[number];

interface UploadImageOptions {
  fileBuffer: Buffer;
  originalFilename: string;
  scope: ImageUploadScope;
  ownerId: string;
}

let configured = false;

function ensureCloudinaryConfigured() {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new ApiError(503, "Image upload is not configured on the server");
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
}

function sanitizePathSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || "general";
}

export async function uploadImageToCloudinary({
  fileBuffer,
  originalFilename,
  scope,
  ownerId,
}: UploadImageOptions) {
  ensureCloudinaryConfigured();

  const folder = [
    env.CLOUDINARY_UPLOAD_FOLDER,
    sanitizePathSegment(ownerId),
    sanitizePathSegment(scope),
  ].join("/");

  return new Promise<{
    publicId: string;
    url: string;
    width?: number;
    height?: number;
    format?: string;
    bytes?: number;
    originalFilename: string;
  }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        unique_filename: true,
        use_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result?.secure_url || !result.public_id) {
          reject(ApiError.badRequest("Image upload failed", error));
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
      },
    );

    stream.on("error", (error) => reject(ApiError.badRequest("Image upload failed", error)));
    stream.end(fileBuffer);
  });
}
