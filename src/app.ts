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
import { partnerLocatorRouter } from "./modules/partner-locator/partner-locator.routes";

export const createApp = (): Application => {
  const app = express();

  app.use(helmet());
  const allowedOrigins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      if (origin.includes("*")) {
        if (!/^https:\/\/[^/]+\.vercel\.app$/.test(origin)) {
          throw new Error(
            "CORS_ORIGINS wildcards are only supported for https://*.vercel.app origins",
          );
        }

        const escapedOrigin = origin
          .split("*")
          .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join("[a-z0-9-]+");

        return new RegExp(`^${escapedOrigin}$`, "i");
      }

      const url = new URL(origin);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("CORS_ORIGINS must contain only http(s) origins");
      }
      if (
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      ) {
        throw new Error(
          "CORS_ORIGINS entries must be origins without paths, queries, credentials, or fragments",
        );
      }

      return url.origin;
    });

  const corsOrigins = allowedOrigins.length
    ? allowedOrigins
    : ["http://localhost:3000", "http://127.0.0.1:3000"];

  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        if (!requestOrigin) {
          callback(null, true);
          return;
        }

        const isAllowed = corsOrigins.some((allowedOrigin) =>
          allowedOrigin instanceof RegExp
            ? allowedOrigin.test(requestOrigin)
            : allowedOrigin === requestOrigin,
        );

        callback(null, isAllowed);
      },
      credentials: true,
    }),
  );
  /*  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  ); */
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "scheme-engine" });
  });

  app.use("/api/intake", intakeRouter);
  app.use("/api/scheme-matching", schemeMatchingRouter);
  app.use("/api/partner-feedback", partnerFeedbackRouter);
  app.use("/api/partner-locator", partnerLocatorRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  app.use(errorHandler);

  return app;
};
