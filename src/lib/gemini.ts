import { GoogleGenAI } from "@google/genai";

/**
 * Gemini access, BYOK (bring-your-own-key).
 *
 * The key stays in the runtime environment — never in the client, never in
 * the repo. The hackathon requires Google AI usage; this is that integration.
 */

export const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

let cached: { client: GoogleGenAI; key: string } | null = null;

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function geminiClient(apiKey?: string): GoogleGenAI {
  const key = apiKey ?? process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Missing GEMINI_API_KEY — set it in the environment (BYOK).");
  }
  if (!cached || cached.key !== key) {
    cached = { client: new GoogleGenAI({ apiKey: key }), key };
  }
  return cached.client;
}

export interface GenerateOptions {
  apiKey?: string;
  model?: string;
  systemInstruction?: string;
  temperature?: number;
}

export async function generateText(
  prompt: string,
  options: GenerateOptions = {},
): Promise<string> {
  const client = geminiClient(options.apiKey);
  const response = await client.models.generateContent({
    model: options.model ?? DEFAULT_MODEL,
    contents: prompt,
    config: {
      systemInstruction: options.systemInstruction,
      temperature: options.temperature ?? 0.4,
    },
  });
  return response.text ?? "";
}

/** Lightweight connectivity probe used by the smoke test. */
export async function ping(apiKey?: string): Promise<string> {
  return generateText("Reply with exactly: pong", {
    apiKey,
    temperature: 0,
  });
}
