import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env";
import { errorMiddleware } from "./middlewares/error.middleware";
import { notFoundMiddleware } from "./middlewares/notFound.middleware";
import { apiRateLimiter } from "./middlewares/rateLimit.middleware";
import { apiRouter } from "./routes";

export const app = express();

if (env.NODE_ENV === "production") {
  // Render and similar platforms terminate TLS at a proxy and set X-Forwarded-For.
  app.set("trust proxy", 1);
}

const configuredCorsOrigins = env.CORS_ORIGIN.split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((origin) =>
    /^https?:\/\//i.test(origin) ? origin : `http://${origin}`,
  );
// Any localhost/127.0.0.1 port, not just the frontend's usual 5173-5175 — dev tooling (Expo web
// preview, Playwright, etc.) binds to arbitrary ports, and a hardcoded port list here previously
// CORS-blocked anything not on that exact list even though this only ever runs in development.
// Mirrors NearCart/backend's src/config/cors.ts, which already solved this the same way.
const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      const isAllowedLocalOrigin =
        env.NODE_ENV !== "production" && localOriginPattern.test(origin ?? "");

      if (!origin || configuredCorsOrigins.includes(origin) || isAllowedLocalOrigin) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);
// Only log API traffic. The server is on a public IP, so internet-wide scanners (e.g. bots
// brute-forcing Synology NAS logins at /webapi/entry.cgi) flood the log with 404s.
app.use(
  morgan(env.NODE_ENV === "production" ? "combined" : "dev", {
    skip: (request) => !request.originalUrl.startsWith("/api"),
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(apiRateLimiter);

app.use("/api", apiRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);
