import { DEFAULT_MODEL as GEMINI_MODEL, generateText as geminiGenerateText } from "./gemini";

/**
 * Which model answers the guide panel — and, just as importantly, which one did.
 *
 * Two providers, in a fixed order of preference:
 *
 *  1. **Gemini** (`GEMINI_API_KEY`). This is the hackathon's requirement and the
 *     default. Nothing else is ever presented as Gemini.
 *  2. **An OpenAI-compatible endpoint** (`LLM_BASE_URL` + `LLM_API_KEY` +
 *     `LLM_MODEL`). Exists so the call path can be exercised end to end against
 *     a real service before a Gemini key is available — or when it is not. The
 *     UI names the model it is actually talking to, so a viewer is never told a
 *     Gemini call happened when one did not.
 *
 * No key at all is also a valid state: the guide falls back to deterministic
 * answers and says so. That path is a feature, not a failure — a demo that dies
 * without a key is a worse demo.
 */

export type LlmProvider = "gemini" | "openai-compatible" | "none";

export interface LlmConfig {
  provider: LlmProvider;
  /** The model id that will be called, e.g. `gemini-2.5-flash`. */
  model: string;
  /** Whether a call can be made at all. */
  configured: boolean;
}

export function llmConfig(): LlmConfig {
  if (process.env.GEMINI_API_KEY) {
    return { provider: "gemini", model: GEMINI_MODEL, configured: true };
  }
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (baseUrl && apiKey) {
    return {
      provider: "openai-compatible",
      model: process.env.LLM_MODEL ?? "unknown-model",
      configured: true,
    };
  }
  return { provider: "none", model: "none", configured: false };
}

export interface LlmGenerateOptions {
  systemInstruction?: string;
  temperature?: number;
}

/** One completion from whichever provider is configured. */
export async function llmGenerateText(
  prompt: string,
  options: LlmGenerateOptions = {},
): Promise<string> {
  const config = llmConfig();
  if (config.provider === "gemini") {
    return geminiGenerateText(prompt, options);
  }
  if (config.provider === "openai-compatible") {
    return openAiCompatibleGenerateText(prompt, options, config.model);
  }
  throw new Error("No model provider configured — set GEMINI_API_KEY, or LLM_BASE_URL + LLM_API_KEY.");
}

/**
 * Chat-completions call against an OpenAI-compatible endpoint.
 *
 * Deliberately small: one system message, one user message, no streaming, no
 * tools, no retries. The guide asks one question and shows one answer, and a
 * timeout is better than a page that hangs — the route degrades to the
 * deterministic fallback and says so.
 */
async function openAiCompatibleGenerateText(
  prompt: string,
  options: LlmGenerateOptions,
  model: string,
): Promise<string> {
  const baseUrl = (process.env.LLM_BASE_URL ?? "").replace(/\/+$/, "");
  const apiKey = process.env.LLM_API_KEY ?? "";
  const messages: Array<{ role: string; content: string }> = [];
  if (options.systemInstruction) {
    messages.push({ role: "system", content: options.systemInstruction });
  }
  messages.push({ role: "user", content: prompt });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.4,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`${model} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error(`${model} returned an empty completion`);
  return text;
}
