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

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((value) => value.trim()),
    credentials: true,
  }),
);
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "2mb" }));
app.use(apiRateLimiter);

app.use("/api", apiRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);
