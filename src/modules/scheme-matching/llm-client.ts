import { HttpError } from "../../common/http-error";
import { env } from "../../config/env";
import { getLogger } from "../../config/logger";
import CircuitBreaker from "opossum";

const logger = getLogger("llm-client");
const DEFAULT_TEMPERATURE = 0.2;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 4_000;
const CIRCUIT_TIMEOUT_MS =
  REQUEST_TIMEOUT_MS * (MAX_RETRIES + 1) + RETRY_MAX_DELAY_MS;

interface ChatCompletionResponse {
  choices: Array<{ message: { content: string } }>;
}

class RetryableLlmError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "RetryableLlmError";
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const isRetryableError = (error: unknown) =>
  error instanceof RetryableLlmError ||
  (error instanceof Error && error.name === "AbortError");

const fetchCompletion = async (
  systemPrompt: string,
  userPrompt: string,
  jsonSchema: JsonSchemaSpec,
  sampling: SamplingOptions = {},
): Promise<string> => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${env.LLM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.LLM_MODEL,
          temperature: sampling.temperature ?? DEFAULT_TEMPERATURE,
          ...(sampling.seed !== undefined && { seed: sampling.seed }),
          response_format: {
            type: "json_schema",
            json_schema: {
              name: jsonSchema.name,
              strict: jsonSchema.strict ?? true,
              schema: jsonSchema.schema,
            },
          },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        logger.warn(
          {
            status: response.status,
            body,
            attempt: attempt + 1,
            schema: jsonSchema.name,
          },
          "LLM provider returned an error",
        );
        if (
          response.status >= 500 ||
          response.status === 408 ||
          response.status === 429
        ) {
          throw new RetryableLlmError(
            `LLM provider returned ${response.status}`,
            response.status,
          );
        }
        throw new Error(`LLM provider returned ${response.status}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices[0]?.message.content;
      if (!content) throw new Error("LLM provider returned an empty response");
      return content;
    } catch (error) {
      if (!isRetryableError(error) || attempt === MAX_RETRIES) throw error;

      const exponentialDelay = Math.min(
        RETRY_MAX_DELAY_MS,
        RETRY_BASE_DELAY_MS * 2 ** attempt,
      );
      const jitter = Math.floor(Math.random() * exponentialDelay * 0.25);
      await delay(exponentialDelay + jitter);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("LLM request exhausted retries");
};

const completionCircuit = new CircuitBreaker(fetchCompletion, {
  timeout: CIRCUIT_TIMEOUT_MS,
  errorThresholdPercentage: 50,
  volumeThreshold: 5,
  resetTimeout: 30_000,
});

completionCircuit.on("open", () => logger.warn("LLM circuit breaker opened"));
completionCircuit.on("halfOpen", () =>
  logger.info("LLM circuit breaker probing provider"),
);
completionCircuit.on("close", () => logger.info("LLM circuit breaker closed"));

export interface JsonSchemaSpec {
  /** Short identifier for this schema, sent as `json_schema.name`. */
  name: string;
  /** JSON Schema object — see json-schema.util.ts for how to derive this from Zod. */
  schema: Record<string, unknown>;
  /**
   * `openai/gpt-oss-120b` on Groq supports constrained decoding
   * (`strict: true`), which makes schema-violating output structurally
   * impossible rather than just probable-to-avoid. Defaults to true;
   * only pass false for a model that only supports best-effort mode.
   */
  strict?: boolean;
}

export interface SamplingOptions {
  /**
   * Defaults to 0.2. Pass 0 for extraction-style calls, where the same
   * message must always yield the same structured fields — a citizen
   * re-sending a sentence should not get a different answer.
   */
  temperature?: number;
  /**
   * Fixed seed for reproducible sampling. Combined with temperature 0
   * this is as close to deterministic as a hosted model gets; the
   * provider treats it as best-effort, so it tightens the output
   * without being something correctness may rest on.
   */
  seed?: number;
}

export const completeJson = async (
  systemPrompt: string,
  userPrompt: string,
  jsonSchema: JsonSchemaSpec,
  sampling?: SamplingOptions,
): Promise<string> => {
  try {
    return await completionCircuit.fire(
      systemPrompt,
      userPrompt,
      jsonSchema,
      sampling ?? {},
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error(
      { err: error, schema: jsonSchema.name },
      "LLM completion failed",
    );
    throw HttpError.badRequest(
      "Scheme matching service is temporarily unavailable",
    );
  }
};
