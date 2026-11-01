import { openai } from "@workspace/integrations-openai-ai-server";
import { reserveModelUsage } from "./ai-usage";
import { logger } from "./logger";

/** Replit development provider only; does not replace AgentPlace's native runtime. */
export async function budgetedCompletion(
  input: Parameters<typeof openai.chat.completions.create>[0] & { stream?: false },
  options: { timeout: number; maxRetries: number } = { timeout: 60_000, maxRetries: 0 },
) {
  await reserveModelUsage(input.messages, input.max_completion_tokens ?? 6144, options.maxRetries + 1);
  const started = Date.now();
  try {
    const response = await openai.chat.completions.create(input, options);
    logger.info({ model: input.model, latencyMs: Date.now() - started,
      inputTokens: response.usage?.prompt_tokens, outputTokens: response.usage?.completion_tokens },
    "AI completion usage");
    return response;
  } catch (error) {
    logger.warn({ model: input.model, latencyMs: Date.now() - started,
      errorType: error instanceof Error ? error.name : "unknown" }, "AI completion failed");
    throw error;
  }
}
