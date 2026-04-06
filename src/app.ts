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
const developmentCorsOrigins =
  env.NODE_ENV === "development"
    ? [
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ]
    : [];
const corsOrigins = Array.from(
  new Set([...configuredCorsOrigins, ...developmentCorsOrigins]),
);

app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "2mb" }));
app.use(apiRateLimiter);

app.use("/api", apiRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);
