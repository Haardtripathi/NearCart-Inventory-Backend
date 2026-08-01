import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";

import { env } from "../config/env";
import type { JwtAuthPayload } from "../types/auth";

// `jti` + `exp` (the latter added automatically by jwt.sign via `expiresIn`) are what make a real
// logout possible — see utils/tokenBlacklist.ts. Every token minted after this change carries a
// unique jti; tokens minted before it won't (verifyAuthToken tolerates that, see auth.middleware.ts).
export interface DecodedAuthToken extends JwtAuthPayload {
  jti: string;
  exp: number;
}

export function signAuthToken(payload: JwtAuthPayload) {
  return jwt.sign({ ...payload, jti: randomUUID() }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as DecodedAuthToken;
}
