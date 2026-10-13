"use client";

import { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

interface Progression {
  author: string;
  agreed: number;
  required: number;
  agreement: string;
  hash: string;
  sig: string;
}

interface MultiResponse {
  status: "agreed" | "no-match";
  terms: Record<string, unknown> | null;
  blocked_by: string[];
  progression: Progression[];
  final: { summary: string; agreement: string };
}

export default function MultiPage() {
  const [data, setData] = useState<MultiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(preset: "agree" | "no-match") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/negotiate-multi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preset }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as MultiResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Multi-party consensus</h1>
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Three independently owned agents converge on one shared outcome. Consensus
          is real: a field is settled only if every required party accepts the same
          value. Watch agreement climb 1/3 → 2/3 → 3/3 — it is never shown as full
          before it is.
        </p>
      </header>

      <div className="flex gap-3">
        <Button onClick={() => run("agree")} disabled={loading}>
          Run consensus (should agree)
        </Button>
        <Button variant="ghost" onClick={() => run("no-match")} disabled={loading}>
          Force no-match
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {data && (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">Outcome</CardTitle>
              <Badge tone={data.status === "agreed" ? "green" : "neutral"}>{data.status}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p>{data.final.summary}</p>
              {data.status === "agreed" && data.terms && (
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  {Object.entries(data.terms).map(([k, v]) => (
                    <div key={k} className="flex flex-col">
                      <dt className="text-neutral-500">{k}</dt>
                      <dd className="font-mono">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {data.blocked_by.length > 0 && (
                <p className="text-xs text-rose-600">
                  blocked by: {data.blocked_by.join(", ")} (no common value)
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Agreement progression</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data.progression.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800"
                >
                  <span className="font-mono text-neutral-600 dark:text-neutral-400">{p.author}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500">
                      {p.agreed}/{p.required}
                    </span>
                    <Badge tone={p.agreement === "full" ? "green" : "amber"}>
                      {p.agreement === "full" ? "full agreement" : `partial ${p.agreed}/${p.required}`}
                    </Badge>
                  </div>
                </div>
              ))}
              {data.progression.length === 1 && data.status === "no-match" && (
                <p className="text-xs text-neutral-500">
                  No consensus — a single no-match card is the result.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
