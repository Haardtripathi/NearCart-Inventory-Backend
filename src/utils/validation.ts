import { LanguageCode } from "@prisma/client";
import { z } from "zod";

export const trimmedString = z.string().trim().min(1);

export const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().trim().min(1).optional());

export const nullableTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}, z.string().trim().min(1).nullable().optional());

// `z.coerce.boolean()` is a common Zod footgun for query params: it does `Boolean(value)`, so the
// literal string "false" (any non-empty string) coerces to `true` instead of `false`. Use this for
// any boolean query/body field where a caller might legitimately send an explicit `false`.
export const strictBooleanQueryParam = z.preprocess((value) => {
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
}, z.boolean().optional());

export const optionalEmailSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed.toLowerCase();
}, z.string().email().optional());

export const jsonValueSchema = z.record(z.any()).or(z.array(z.any())).or(z.string()).or(z.number()).or(z.boolean()).or(z.null());

export const optionalJsonSchema = z.unknown().optional();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalTrimmedString,
});

export const decimalInputSchema = z.union([
  z.number(),
  z.string().trim().min(1),
]);

export const optionalDecimalInputSchema = decimalInputSchema.optional();

export const dateInputSchema = z.coerce.date();

export const optionalDateInputSchema = z.coerce.date().optional();

export const idParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const languageCodeSchema = z.nativeEnum(LanguageCode);

// Optional pickup-point coordinates (e.g. `Branch.latitude`/`longitude`, used by
// nearest-free-driver auto-assignment). `z.coerce.number()` so a raw form input or querystring
// value still validates, but an explicit `null` is preserved (rather than coerced to 0) so a
// caller can intentionally clear a previously-set coordinate.
export const optionalLatitudeSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().min(-90).max(90).nullable().optional(),
);

export const optionalLongitudeSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().min(-180).max(180).nullable().optional(),
);

// Shared by both the shop-staff (`/api/users/device-token`) and driver
// (`/api/driver/device-token`) registration endpoints — same payload shape either side of the
// polymorphic DeviceToken model (see prisma schema: ownerType discriminates 'USER' vs 'DRIVER').
// The prefix check isn't load-bearing (send-time code already filters non-Expo-format tokens
// before calling Expo's API) but rejecting junk at registration gives the client immediate,
// actionable feedback instead of a silent no-op days later when a push never arrives.
export const deviceTokenSchema = z.object({
  expoPushToken: trimmedString.regex(
    /^ExponentPushToken\[.+\]$/,
    "expoPushToken must be a valid Expo push token (ExponentPushToken[...])",
  ),
  platform: z.enum(["android", "ios"]).optional(),
});

export function uniqueLanguageArraySchema<TSchema extends z.ZodTypeAny>(itemSchema: TSchema) {
  return z.array(itemSchema).superRefine((entries, ctx) => {
    const seen = new Set<string>();

    entries.forEach((entry, index) => {
      const language = (entry as { language?: string }).language;

      if (!language) {
        return;
      }

      if (seen.has(language)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate translation for language ${language}`,
          path: [index, "language"],
        });
        return;
      }

      seen.add(language);
    });
  });
}
