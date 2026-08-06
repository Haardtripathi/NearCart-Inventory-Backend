import Replicate from "replicate";

import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export function isReplicateConfigured(): boolean {
  return Boolean(env.REPLICATE_API_TOKEN);
}

let client: Replicate | null = null;

function getClient(): Replicate {
  if (!client) {
    client = new Replicate({ auth: env.REPLICATE_API_TOKEN });
  }
  return client;
}

// Single general-purpose vision-instruct model used for every prompt below (clarity check, shop
// signboard OCR, vehicle plate OCR, license field extraction) — asking it to always answer in
// strict JSON keeps one small parsing helper (parseJsonFromModelOutput) reusable across all three
// verification endpoints instead of needing a different model/parser per task.
//
// Live-tested 2026-08-02. yorickvp/llava-13b is a community (non-"official") model, so
// Replicate's versionless `/models/{owner}/{name}/predictions` endpoint 404s on it — community
// models must be pinned to a specific version hash. Pulled from
// `GET /v1/models/yorickvp/llava-13b` -> `latest_version.id` at test time; if this model is ever
// updated upstream, re-fetch that id rather than assuming this hash stays current.
const VISION_MODEL = "yorickvp/llava-13b:80537f9eead1a5bfa72d5ac6ea6414379be41d4d4f6679fd776e9535d1eb58bb";

interface ModelJsonResponse {
  [key: string]: unknown;
}

// Replicate's `run()` resolves to whatever the model's output schema declares — often a string
// for LLM-shaped models, sometimes an array of string chunks that need joining (matches Replicate
// LLM streaming-style outputs). Normalize to one string, then pull the first {...} block out of
// it since instruct models frequently wrap JSON in prose or a ```json fence despite being asked
// not to.
function coerceToText(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.join("");
  return JSON.stringify(output);
}

function parseJsonFromModelOutput(output: unknown): ModelJsonResponse | null {
  const text = coerceToText(output);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as ModelJsonResponse;
  } catch {
    return null;
  }
}

async function runVisionPrompt(imageUrl: string, prompt: string): Promise<ModelJsonResponse | null> {
  let output: unknown;

  try {
    output = await getClient().run(VISION_MODEL, {
      input: {
        image: imageUrl,
        prompt,
        max_tokens: 512,
      },
    });
  } catch (error) {
    // A raw Replicate/model failure (rate limit, model-side error, transient outage) previously
    // bubbled up as an uncaught 500 with the third-party error string forwarded straight to the
    // client (e.g. "Prediction failed: mean must have 1 elements...") — the wrong status code (this
    // isn't our bug) and a message no driver/shop-owner could act on. Log the real cause
    // server-side, surface a clean 503 instead.
    console.error("[replicate] Vision prediction failed:", error);
    throw ApiError.serviceUnavailable(
      "Photo verification service is temporarily unavailable. Please try again in a moment.",
    );
  }

  return parseJsonFromModelOutput(output);
}

export interface ShopPhotoAssessment {
  clarityOk: boolean;
  nameDetectedInPhoto: string | null;
  reasons: string[];
}

/**
 * Assesses shop-photo clarity and reads any visible shop-name text (e.g. a signboard) in the
 * photo. Used by POST /branches/:id/verification/photo.
 */
export async function assessShopPhoto(imageUrl: string): Promise<ShopPhotoAssessment> {
  const prompt = `You are inspecting a photo submitted by a shop owner as proof of their physical shop
front. Answer strictly as JSON, no prose, no markdown fence, matching exactly this shape:
{"clarityOk": boolean, "nameDetectedInPhoto": string|null, "reason": string}
"clarityOk" is true only if the photo is in-focus, well-lit, and clearly shows a shop
front/storefront (not a blurry, dark, cropped, or unrelated image). "nameDetectedInPhoto" is the
shop/business name as written on any visible signboard or storefront text, or null if no legible
name text is visible. "reason" is a one-sentence explanation of your clarity judgement.`;

  const parsed = await runVisionPrompt(imageUrl, prompt);

  if (!parsed) {
    return {
      clarityOk: false,
      nameDetectedInPhoto: null,
      reasons: ["Could not interpret the verification model's response"],
    };
  }

  return {
    clarityOk: Boolean(parsed.clarityOk),
    nameDetectedInPhoto: typeof parsed.nameDetectedInPhoto === "string" ? parsed.nameDetectedInPhoto : null,
    reasons: [typeof parsed.reason === "string" ? parsed.reason : "Clarity/name-detection check completed"],
  };
}

export interface VehiclePhotoAssessment {
  clarityOk: boolean;
  plateDetected: boolean;
  plateText: string | null;
  reasons: string[];
}

/** Used by POST /driver/verification/vehicle-photo. */
export async function assessVehiclePhoto(imageUrl: string): Promise<VehiclePhotoAssessment> {
  const prompt = `You are inspecting a photo submitted by a delivery driver of their vehicle. Answer
strictly as JSON, no prose, no markdown fence, matching exactly this shape:
{"clarityOk": boolean, "plateDetected": boolean, "plateText": string|null, "reason": string}
"clarityOk" is true only if the photo is in-focus, well-lit, and clearly shows a vehicle.
"plateDetected" is true if a number plate is visible anywhere in the frame. "plateText" is the
number plate text exactly as it appears (uppercase, no extra spaces), or null if none is visible
or legible. "reason" is a one-sentence explanation.`;

  const parsed = await runVisionPrompt(imageUrl, prompt);

  if (!parsed) {
    return {
      clarityOk: false,
      plateDetected: false,
      plateText: null,
      reasons: ["Could not interpret the verification model's response"],
    };
  }

  return {
    clarityOk: Boolean(parsed.clarityOk),
    plateDetected: Boolean(parsed.plateDetected),
    plateText: typeof parsed.plateText === "string" ? parsed.plateText.trim().toUpperCase() : null,
    reasons: [typeof parsed.reason === "string" ? parsed.reason : "Clarity/plate-detection check completed"],
  };
}

export interface LicenseOcrResult {
  clarityOk: boolean;
  extracted: {
    name: string | null;
    licenseNumber: string | null;
    dob: string | null;
    expiry: string | null;
  };
  reasons: string[];
}

/** Used by POST /driver/verification/license. */
export async function extractLicenseFields(imageUrl: string): Promise<LicenseOcrResult> {
  const prompt = `You are reading a photo of a driving license document. Answer strictly as JSON, no
prose, no markdown fence, matching exactly this shape:
{"clarityOk": boolean, "name": string|null, "licenseNumber": string|null, "dob": string|null,
"expiry": string|null, "reason": string}
"clarityOk" is true only if the document photo is in-focus, well-lit, and not obscured/cropped so
that the text is legible. "name" is the license holder's full name as printed. "licenseNumber" is
the license/DL number exactly as printed. "dob" and "expiry" are dates in YYYY-MM-DD format if
determinable, otherwise null. Use null for any field you cannot read confidently — do not guess.
"reason" is a one-sentence explanation of your clarity judgement.`;

  const parsed = await runVisionPrompt(imageUrl, prompt);

  if (!parsed) {
    return {
      clarityOk: false,
      extracted: { name: null, licenseNumber: null, dob: null, expiry: null },
      reasons: ["Could not interpret the verification model's response"],
    };
  }

  return {
    clarityOk: Boolean(parsed.clarityOk),
    extracted: {
      name: typeof parsed.name === "string" ? parsed.name : null,
      licenseNumber: typeof parsed.licenseNumber === "string" ? parsed.licenseNumber : null,
      dob: typeof parsed.dob === "string" ? parsed.dob : null,
      expiry: typeof parsed.expiry === "string" ? parsed.expiry : null,
    },
    reasons: [typeof parsed.reason === "string" ? parsed.reason : "License OCR completed"],
  };
}
