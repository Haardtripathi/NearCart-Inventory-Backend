"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isReplicateConfigured = isReplicateConfigured;
exports.assessShopPhoto = assessShopPhoto;
exports.assessVehiclePhoto = assessVehiclePhoto;
exports.extractLicenseFields = extractLicenseFields;
const replicate_1 = __importDefault(require("replicate"));
const env_1 = require("../config/env");
function isReplicateConfigured() {
    return Boolean(env_1.env.REPLICATE_API_TOKEN);
}
let client = null;
function getClient() {
    if (!client) {
        client = new replicate_1.default({ auth: env_1.env.REPLICATE_API_TOKEN });
    }
    return client;
}
// Single general-purpose vision-instruct model used for every prompt below (clarity check, shop
// signboard OCR, vehicle plate OCR, license field extraction) — asking it to always answer in
// strict JSON keeps one small parsing helper (parseJsonFromModelOutput) reusable across all three
// verification endpoints instead of needing a different model/parser per task.
//
// NOT LIVE-TESTED: no REPLICATE_API_TOKEN exists anywhere in this workspace as of this change
// (see backend/.env.example), so this identifier has never actually been invoked. It's a
// reasonable, actively-maintained multimodal instruction model on Replicate at the time of
// writing, but treat it as a placeholder — swap it here (one constant) once a real token is
// configured and this has been smoke-tested against it.
const VISION_MODEL = "yorickvp/llava-13b";
// Replicate's `run()` resolves to whatever the model's output schema declares — often a string
// for LLM-shaped models, sometimes an array of string chunks that need joining (matches Replicate
// LLM streaming-style outputs). Normalize to one string, then pull the first {...} block out of
// it since instruct models frequently wrap JSON in prose or a ```json fence despite being asked
// not to.
function coerceToText(output) {
    if (typeof output === "string")
        return output;
    if (Array.isArray(output))
        return output.join("");
    return JSON.stringify(output);
}
function parseJsonFromModelOutput(output) {
    const text = coerceToText(output);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match)
        return null;
    try {
        return JSON.parse(match[0]);
    }
    catch {
        return null;
    }
}
async function runVisionPrompt(imageUrl, prompt) {
    const output = await getClient().run(VISION_MODEL, {
        input: {
            image: imageUrl,
            prompt,
            max_tokens: 512,
        },
    });
    return parseJsonFromModelOutput(output);
}
/**
 * Assesses shop-photo clarity and reads any visible shop-name text (e.g. a signboard) in the
 * photo. Used by POST /branches/:id/verification/photo.
 */
async function assessShopPhoto(imageUrl) {
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
/** Used by POST /driver/verification/vehicle-photo. */
async function assessVehiclePhoto(imageUrl) {
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
/** Used by POST /driver/verification/license. */
async function extractLicenseFields(imageUrl) {
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
