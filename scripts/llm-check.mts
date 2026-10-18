/**
 * One real model call — the check that the guide's call path is actually wired.
 *
 *   npm run check:llm
 *
 * Why this exists. Every other gate in this repo is hermetic: unit tests, the
 * Firestore emulator check and the HTTP smoke test all pass without a network
 * and without a key, because the guide degrades to a deterministic answer when
 * no model is configured. That is good for a gate and bad for confidence — the
 * suite would have stayed green even if the provider call had never once run.
 *
 * So this is the non-hermetic one, kept out of `npm test` on purpose: it makes a
 * single real request and fails loudly if it cannot. Run it after configuring a
 * key, and after switching providers.
 *
 * It reports which provider answered. A test provider (an OpenAI-compatible
 * endpoint) is never reported as Gemini.
 */
import { llmConfig, llmGenerateText } from "../src/lib/llm";

const checks: Array<[boolean, string, string]> = [];
const check = (ok: boolean, label: string, detail: string) => {
  checks.push([ok, label, detail]);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}  (${detail})`);
};

const config = llmConfig();
console.log(`\n=== Guide panel — live model call ===`);
console.log(`  provider  ${config.provider}`);
console.log(`  model     ${config.model}\n`);

check(
  config.configured,
  "a model provider is configured",
  config.provider === "none" ? "none — set GEMINI_API_KEY or LLM_BASE_URL + LLM_API_KEY" : config.provider,
);

if (!config.configured) {
  console.log(`\nFAILED: nothing to call.\n`);
  process.exitCode = 1;
} else {
  // Deliberately not a question the deterministic fallback can answer, so a
  // silent fallback cannot pass for a model call.
  const prompt =
    "In one short sentence, name the three states a claim can carry in this product. " +
    "Do not explain.";

  const started = Date.now();
  try {
    const answer = await llmGenerateText(prompt, {
      systemInstruction:
        "You are a terse assistant. Answer in one sentence. The three states are: " +
        "evidence, self_reported, unverified.",
      temperature: 0,
    });
    const ms = Date.now() - started;
    console.log(`  answer    ${answer.trim().slice(0, 300)}`);
    console.log(`  latency   ${ms}ms\n`);

    check(answer.trim().length > 0, "the provider returned a non-empty answer", `${answer.trim().length} chars`);
    check(
      /evidence/i.test(answer) && /self.?reported/i.test(answer),
      "the answer came from the model, not the deterministic fallback",
      "names evidence + self_reported",
    );
    check(ms < 30_000, "the call returned inside the 30s timeout", `${ms}ms`);
    check(
      config.provider === "gemini" || config.provider === "openai-compatible",
      "the provider is one this build supports",
      config.provider,
    );
  } catch (error) {
    check(false, "the call completed", error instanceof Error ? error.message : String(error));
  }

  const failed = checks.filter(([ok]) => !ok).length;
  console.log(`\n  ${failed === 0 ? "OK" : "FAILED"}: ${checks.length - failed}/${checks.length} checks passed`);
  if (failed > 0) process.exitCode = 1;
  if (config.provider !== "gemini") {
    console.log(
      `\n  NOTE: this is ${config.provider}, not Gemini. The hackathon submission must run on\n` +
        `  Gemini — set GEMINI_API_KEY before recording, then re-run this check.\n`,
    );
  }
}
