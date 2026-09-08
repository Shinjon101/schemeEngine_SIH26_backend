import { createApp } from "./app";
import { env } from "./config/env";
import logger from "./config/logger";

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "Scheme Engine started");
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutdown signal received");

  server.close((error) => {
    if (error) {
      logger.error({ error }, "Failed to close HTTP server");
      process.exitCode = 1;
      return;
    }

    logger.info("HTTP server closed");
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
