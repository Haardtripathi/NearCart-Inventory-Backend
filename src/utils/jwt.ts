import jwt from "jsonwebtoken";

import { env } from "../config/env";
import type { JwtAuthPayload } from "../types/auth";

export function signAuthToken(payload: JwtAuthPayload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as JwtAuthPayload;
}
