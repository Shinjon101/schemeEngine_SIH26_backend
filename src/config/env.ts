import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.url({
    message: "DATABASE_URL must be a valid connection URL",
  }),

  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  LLM_BASE_URL: z.url().default("https://api.groq.com/openai/v1"),
  LLM_API_KEY: z.string().min(1, "LLM_API_KEY is required for scheme matching"),
  LLM_MODEL: z.string().default("openai/gpt-oss-120b"),

  // OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required for the Scheme Matcher").optional(),

  // Optional Admin Credentials for Partner Portal
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formattedErrors = JSON.stringify(result.error.format(), null, 2);
    console.error("Environment variable validation failed:\n", formattedErrors);
    throw new Error(`[SchemeEngine] Environment variable validation failed.`);
  }

  return result.data;
};

export const env = parseEnv();
export type Env = typeof env;
