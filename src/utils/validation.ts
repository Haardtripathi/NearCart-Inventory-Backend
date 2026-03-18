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
