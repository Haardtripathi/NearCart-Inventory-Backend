import { ApiError } from "../../utils/ApiError";
import { buildTranslations } from "../../utils/libreTranslate";

export async function translateItemText(text: string) {
  try {
    return await buildTranslations(text, "auto");
  } catch (error) {
    throw new ApiError(
      502,
      error instanceof Error ? error.message : "Failed to translate text with the local LibreTranslate server",
    );
  }
}
