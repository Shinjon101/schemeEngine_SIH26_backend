import pino from "pino";

import { env } from "./env";

// pino-pretty is a devDependency; fall back to JSON logs when it isn't
// installed (e.g. a host that prunes devDependencies) instead of crashing.
const hasPrettyTransport = (() => {
  try {
    require.resolve("pino-pretty");
    return true;
  } catch {
    return false;
  }
})();

const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV !== "production" && hasPrettyTransport
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
