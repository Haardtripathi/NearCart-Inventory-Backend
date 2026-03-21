import { z } from "zod";

export const translateItemSchema = z.object({
  text: z.string().trim().min(1, "text is required"),
});
