"use client";

import * as React from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

/**
 * Ask the guide — the panel that makes the Gemini demonstration client
 * visible on the judge click path. The guide is NOT part of the product
 * core (the infrastructure contains no agent and no LLM); it exists to
 * satisfy the hackathon's Gemini requirement, grounded in the live board.
 *
 * Honesty rules baked into the UI:
 * - every answer carries a source badge: "gemini" or "deterministic fallback"
 * - without an API key the fallback path is shown, never faked
 */

const SUGGESTED_QUESTIONS = [
  "Which deal should I confirm?",
  "Why did Orion drop out?",
  "Why is Delta not closed yet?",
  "Where does the data come from?",
];

interface GuideResponse {
  role: string;
  answer?: string;
  source?: "gemini" | "deterministic-fallback";
  grounded?: string;
  tool?: string;
  result?: string;
}

function SourceBadge({ source }: { source?: string }) {
  if (source === "gemini") {
    return <Badge tone="green">Gemini</Badge>;
  }
  if (source === "deterministic-fallback") {
    return <Badge tone="amber">fixed fallback (no API key)</Badge>;
  }
  if (source === "deterministic") {
    return <Badge tone="amber">deterministic tool</Badge>;
  }
  return null;
}

export function GuidePanel() {
  const [question, setQuestion] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [response, setResponse] = React.useState<GuideResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = (await res.json()) as GuideResponse;
      setResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Ask about your deals</CardTitle>
        <Badge tone="blue">powered by Gemini</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setQuestion(q);
                void ask(q);
              }}
              disabled={loading}
              className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {q}
            </button>
          ))}
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your deals"
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950"
          />
          <Button type="submit" disabled={loading || !question.trim()}>
            {loading ? "Asking…" : "Ask"}
          </Button>
        </form>

        {error && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            Couldn&apos;t get an answer: {error}
          </p>
        )}

        {response && (
          <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900">
            {response.tool === "verify_terms" && response.result ? (
              <pre className="whitespace-pre-wrap break-all font-mono text-xs text-neutral-700 dark:text-neutral-300">
                {response.result}
              </pre>
            ) : (
              <p className="whitespace-pre-line text-sm text-neutral-800 dark:text-neutral-200">
                {response.answer}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">answered by</span>
              <SourceBadge source={response.source} />
            </div>
            {response.grounded && (
              <details className="text-xs text-neutral-500">
                <summary className="cursor-pointer">What the answer was based on</summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-2 font-mono text-[11px] dark:bg-neutral-950">
                  {response.grounded}
                </pre>
              </details>
            )}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
          A demo client that answers from the live deals with a Gemini call. Without an
          API key it falls back to a fixed answer and says so.
        </p>
      </CardContent>
    </Card>
  );
}
