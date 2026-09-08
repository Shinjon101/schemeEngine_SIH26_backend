import type { Application } from "express";
import express from "express";
import { errorHandler } from "./middleware/error-handler";

export const createApp = (): Application => {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "scheme-engine" });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  app.use(errorHandler);

  return app;
};
