import { z } from "zod";

// `POST /api/translate-item` has no auth middleware (confirmed intentionally left that way — see
// this repo's own CLAUDE.md/ARCHITECTURE_NOTES.md — presumably meant as public catalog-text
// translation) and proxies attacker-controlled `text` straight into two real LibreTranslate calls
// (en + hi) plus a Redis cache write keyed by its hash. Without a length cap, an unauthenticated
// caller could submit near-the-global-2mb-body-limit text repeatedly, running up compute cost
// against the self-hosted LibreTranslate instance and filling the translation Redis cache with
// large, unique (attacker-controlled) entries. 1000 chars comfortably covers this endpoint's real
// use case (translating a single catalog item's name/short description, not documents).
const TRANSLATE_ITEM_TEXT_MAX_LENGTH = 1000;

export const translateItemSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "text is required")
    .max(
      TRANSLATE_ITEM_TEXT_MAX_LENGTH,
      `text must be ${TRANSLATE_ITEM_TEXT_MAX_LENGTH} characters or fewer`,
    ),
});
