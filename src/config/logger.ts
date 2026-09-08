import pino from "pino";

import { env } from "./env";

const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        }
      : undefined,
});

export const getLogger = (moduleName: string) => {
  return logger.child({ module: moduleName });
};

export default logger;
