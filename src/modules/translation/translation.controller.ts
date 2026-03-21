import type { Request, Response } from "express";

import { translateItemText } from "./translation.service";

export async function translateItemController(req: Request, res: Response) {
  const translations = await translateItemText(req.body.text);
  return res.status(200).json(translations);
}
