import { HttpError } from "../../common/http-error";
import { env } from "../../config/env";
import { getLogger } from "../../config/logger";

const logger = getLogger("llm-client");
const REQUEST_TIMEOUT_MS = 15_000;

interface ChatCompletionResponse {
  choices: Array<{ message: { content: string } }>;
}

export const completeJson = async (
  systemPrompt: string,
  userPrompt: string,
): Promise<string> => {
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
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body },
        "LLM provider returned an error",
      );
      throw HttpError.badRequest(
        "Scheme matching service is temporarily unavailable",
      );
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices[0]?.message.content;

    if (!content) {
      throw HttpError.badRequest(
        "Scheme matching service returned an empty response",
      );
    }

    return content;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error({ err: error }, "Failed to reach LLM provider");
    throw HttpError.badRequest(
      "Scheme matching service is temporarily unavailable",
    );
  } finally {
    clearTimeout(timeout);
  }
};
