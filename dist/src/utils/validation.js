"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceTokenSchema = exports.optionalLongitudeSchema = exports.optionalLatitudeSchema = exports.languageCodeSchema = exports.idParamSchema = exports.optionalDateInputSchema = exports.dateInputSchema = exports.optionalDecimalInputSchema = exports.decimalInputSchema = exports.paginationQuerySchema = exports.optionalJsonSchema = exports.jsonValueSchema = exports.optionalEmailSchema = exports.strictBooleanQueryParam = exports.nullableTrimmedString = exports.optionalTrimmedString = exports.trimmedString = void 0;
exports.uniqueLanguageArraySchema = uniqueLanguageArraySchema;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
// Every one of these (name, description, notes, rejectionReason, address lines, legalName, ...)
// can end up passed straight into LibreTranslate via `enrichWithAutoTranslations` /
// `syncEntityFieldTranslations` (see `utils/libreTranslate.ts`) whenever AUTO_TRANSLATE_ON_WRITE
// is true (it is in this repo's `.env`). Unlike `POST /api/translate-item`, which already caps
// its `text` field at 1000 chars specifically to bound this cost (see
// `modules/translation/translation.validation.ts`), these generic field schemas had no cap at
// all — confirmed by directly creating a product with a ~26,600-char description: the request
// took over 60 seconds (bumping into libreTranslate.ts's own 60s AbortSignal.timeout) because it
// blocked on two real synchronous translation calls (en + hi) with no length limit. Any
// authenticated user able to write a product/category/customer/sales-order/etc. could use this to
// hang a request handler for a minute+ per call, and concurrent large submissions could starve the
// shared 2-thread self-hosted LibreTranslate instance for every organization at once. 1000 chars
// mirrors the existing translate-item cap and comfortably covers real name/description/notes/
// address/reason values.
const TRIMMED_STRING_MAX_LENGTH = 1000;
exports.trimmedString = zod_1.z.string().trim().min(1).max(TRIMMED_STRING_MAX_LENGTH);
exports.optionalTrimmedString = zod_1.z.preprocess((value) => {
    if (typeof value !== "string") {
        return value;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
}, zod_1.z.string().trim().min(1).max(TRIMMED_STRING_MAX_LENGTH).optional());
exports.nullableTrimmedString = zod_1.z.preprocess((value) => {
    if (typeof value !== "string") {
        return value;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
}, zod_1.z.string().trim().min(1).max(TRIMMED_STRING_MAX_LENGTH).nullable().optional());
// `z.coerce.boolean()` is a common Zod footgun for query params: it does `Boolean(value)`, so the
// literal string "false" (any non-empty string) coerces to `true` instead of `false`. Use this for
// any boolean query/body field where a caller might legitimately send an explicit `false`.
exports.strictBooleanQueryParam = zod_1.z.preprocess((value) => {
    if (typeof value === "boolean") {
        return value;
    }
    if (value === "true") {
        return true;
    }
    if (value === "false") {
        return false;
    }
    return value;
}, zod_1.z.boolean().optional());
exports.optionalEmailSchema = zod_1.z.preprocess((value) => {
    if (typeof value !== "string") {
        return value;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed.toLowerCase();
}, zod_1.z.string().email().optional());
exports.jsonValueSchema = zod_1.z.record(zod_1.z.any()).or(zod_1.z.array(zod_1.z.any())).or(zod_1.z.string()).or(zod_1.z.number()).or(zod_1.z.boolean()).or(zod_1.z.null());
exports.optionalJsonSchema = zod_1.z.unknown().optional();
exports.paginationQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    search: exports.optionalTrimmedString,
});
exports.decimalInputSchema = zod_1.z.union([
    zod_1.z.number(),
    zod_1.z.string().trim().min(1),
]);
exports.optionalDecimalInputSchema = exports.decimalInputSchema.optional();
exports.dateInputSchema = zod_1.z.coerce.date();
exports.optionalDateInputSchema = zod_1.z.coerce.date().optional();
exports.idParamSchema = zod_1.z.object({
    id: zod_1.z.string().trim().min(1),
});
exports.languageCodeSchema = zod_1.z.nativeEnum(client_1.LanguageCode);
// Optional pickup-point coordinates (e.g. `Branch.latitude`/`longitude`, used by
// nearest-free-driver auto-assignment). `z.coerce.number()` so a raw form input or querystring
// value still validates, but an explicit `null` is preserved (rather than coerced to 0) so a
// caller can intentionally clear a previously-set coordinate.
exports.optionalLatitudeSchema = zod_1.z.preprocess((value) => (value === "" ? undefined : value), zod_1.z.coerce.number().min(-90).max(90).nullable().optional());
exports.optionalLongitudeSchema = zod_1.z.preprocess((value) => (value === "" ? undefined : value), zod_1.z.coerce.number().min(-180).max(180).nullable().optional());
// Shared by both the shop-staff (`/api/users/device-token`) and driver
// (`/api/driver/device-token`) registration endpoints — same payload shape either side of the
// polymorphic DeviceToken model (see prisma schema: ownerType discriminates 'USER' vs 'DRIVER').
// The prefix check isn't load-bearing (send-time code already filters non-Expo-format tokens
// before calling Expo's API) but rejecting junk at registration gives the client immediate,
// actionable feedback instead of a silent no-op days later when a push never arrives.
exports.deviceTokenSchema = zod_1.z.object({
    expoPushToken: exports.trimmedString.regex(/^ExponentPushToken\[.+\]$/, "expoPushToken must be a valid Expo push token (ExponentPushToken[...])"),
    platform: zod_1.z.enum(["android", "ios"]).optional(),
});
function uniqueLanguageArraySchema(itemSchema) {
    return zod_1.z.array(itemSchema).superRefine((entries, ctx) => {
        const seen = new Set();
        entries.forEach((entry, index) => {
            const language = entry.language;
            if (!language) {
                return;
            }
            if (seen.has(language)) {
                ctx.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    message: `Duplicate translation for language ${language}`,
                    path: [index, "language"],
                });
                return;
            }
            seen.add(language);
        });
    });
}
