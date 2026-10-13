"use client";

import { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

interface Round {
  round: number;
  from: string;
  role: "buyer" | "seller";
  price: number;
  fields: Record<string, unknown>;
}

interface Outcome {
  status: "agreed" | "impasse";
  rounds: Round[];
  price: number | null;
  gap: string | null;
  leaked: string[];
}

interface ResultCard {
  status: string;
  summary: string;
  terms: Record<string, unknown>;
  hash: string;
  agreement: string;
  agreed_by: string[];
  required_parties: string[];
}

interface NegotiateResponse {
  card: ResultCard;
  outcome: Outcome;
  signer_public_key: string;
  policy_leak: string[];
}

export default function DemoPage() {
  const [data, setData] = useState<NegotiateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(preset: "converge" | "impasse") {
    setLoading(true);
    setError(null);
    try {
      const buyer = { reservation: preset === "impasse" ? 3.9 : 4.8 };
      const seller = { reservation: 4.2 };
      const res = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room_id: `room-live-${preset}`, buyer, seller }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as NegotiateResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Live negotiation</h1>
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Two agents negotiate autonomously — no human gate inside the loop. Run
          the anchor scenario and watch it converge, or force an impasse. The
          trace shows every round and proves no forbidden field went on the wire.
        </p>
      </header>

      <div className="flex gap-3">
        <Button onClick={() => run("converge")} disabled={loading}>
          Run anchor (should converge)
        </Button>
        <Button variant="ghost" onClick={() => run("impasse")} disabled={loading}>
          Force impasse
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
              <div className="flex items-center gap-2">
                <Badge tone={data.outcome.status === "agreed" ? "green" : "red"}>
                  {data.outcome.status}
                </Badge>
                <Badge tone={data.policy_leak.length === 0 ? "green" : "red"}>
                  {data.policy_leak.length === 0
                    ? "no forbidden field emitted"
                    : `leak: ${data.policy_leak.join(", ")}`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p>{data.card.summary}</p>
              <p className="text-xs text-neutral-500">
                agreement: {data.card.agreement} ({data.card.agreed_by.length}/
                {data.card.required_parties.length}) · gap: {data.outcome.gap ?? "none"}
              </p>
              <code className="break-all rounded bg-neutral-100 p-2 font-mono text-[11px] dark:bg-neutral-900">
                {data.card.hash}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Round trace ({data.outcome.rounds.length} messages)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4">from</th>
                    <th className="py-2 pr-4">price</th>
                    <th className="py-2 pr-4">fields</th>
                  </tr>
                </thead>
                <tbody>
                  {data.outcome.rounds.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100 last:border-0 dark:border-neutral-900">
                      <td className="py-1.5 pr-4">{r.round}</td>
                      <td className="py-1.5 pr-4">
                        <Badge tone={r.role === "buyer" ? "blue" : "neutral"}>{r.role}</Badge>
                      </td>
                      <td className="py-1.5 pr-4 font-mono">{r.price}</td>
                      <td className="py-1.5 pr-4 font-mono text-neutral-500">
                        {JSON.stringify(r.fields)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
