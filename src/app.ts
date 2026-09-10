import type { Application } from "express";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error-handler";
import { intakeRouter } from "./modules/scheme-matching/intake.routes";
import { schemeMatchingRouter } from "./modules/scheme-matching/scheme-matching.routes";
import { partnerFeedbackRouter } from "./modules/partner-feedback/partner-feedback.routes";

export const createApp = (): Application => {
  const app = express();

  app.use(helmet());
  const allowedOrigins = env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins?.length ? allowedOrigins : false,
    }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "scheme-engine" });
  });

  app.use("/api/intake", intakeRouter);
  app.use("/api/scheme-matching", schemeMatchingRouter);
  app.use("/api/partner-feedback", partnerFeedbackRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  app.use(errorHandler);

  return app;
};
