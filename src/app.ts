import type { Application } from "express";
import express from "express";
import { errorHandler } from "./middleware/error-handler";
import { intakeRouter } from "./modules/scheme-matching/intake.routes";
import { schemeMatchingRouter } from "./modules/scheme-matching/scheme-matching.routes";

export const createApp = (): Application => {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "scheme-engine" });
  });

  app.use("/api/intake", intakeRouter);
  app.use("/api/scheme-matching", schemeMatchingRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  app.use(errorHandler);

  return app;
};
