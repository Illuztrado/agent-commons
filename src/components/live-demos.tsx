"use client";

import { useState } from "react";
import { agentName, readableTerms } from "@/lib/overview";
import { cn } from "@/lib/utils";

/**
 * Live demos — both negotiation demos, in plain words. Shown in the floating
 * demo panel (outside the product UI) and at /demo.
 *
 * Two companies: a buyer and a supplier haggle over price with no human in the
 * loop (POST /api/negotiate). Three friends: three agents settle one shared plan,
 * and agreement is shown climbing 1/3 → 3/3, never full before it is
 * (POST /api/negotiate-multi). The technical trace for each run — every round,
 * the hash, the no-leak check — stays one click away.
 */

interface Round {
  round: number;
  from: string;
  role: "buyer" | "seller";
  price: number;
  fields: Record<string, unknown>;
}

interface NegotiateResponse {
  card: {
    summary: string;
    terms: Record<string, unknown>;
    hash: string;
    agreement: string;
    agreed_by: string[];
    required_parties: string[];
  };
  outcome: {
    status: "agreed" | "impasse";
    rounds: Round[];
    price: number | null;
    gap: string | null;
  };
  policy_leak: string[];
}

interface MultiResponse {
  status: "agreed" | "no-match";
  terms: Record<string, unknown> | null;
  blocked_by: string[];
  progression: { author: string; agreed: number; required: number; agreement: string; hash: string }[];
  final: { summary: string; agreement: string };
}

function useRun<T>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(url: string, body: unknown) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  return { data, loading, error, run };
}

function ScenarioButton({
  onClick,
  disabled,
  title,
  detail,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-start gap-0.5 rounded-xl border border-neutral-300 px-4 py-3 text-left transition-colors hover:border-sky-400 hover:bg-sky-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:border-sky-700 dark:hover:bg-sky-950"
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <span className="text-sky-600">▶</span> {title}
      </span>
      <span className="text-xs text-neutral-600 dark:text-neutral-400">{detail}</span>
    </button>
  );
}

function Result({ ok, title, text }: { ok: boolean; title: string; text: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        ok
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
          : "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950",
      )}
    >
      <div
        className={cn(
          "text-lg font-semibold",
          ok ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300",
        )}
      >
        {title}
      </div>
      <p className="text-sm text-neutral-700 dark:text-neutral-300">{text}</p>
    </div>
  );
}

export function TwoCompanies() {
  const { data, loading, error, run } = useRun<NegotiateResponse>();
  const start = (preset: "converge" | "impasse") =>
    run("/api/negotiate", {
      room_id: `room-live-${preset}`,
      buyer: { reservation: preset === "impasse" ? 3.9 : 4.8 },
      seller: { reservation: 4.2 },
    });

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div>
        <h2 className="text-lg font-semibold">A buyer and a supplier agree on a price</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Each agent knows only its own limit. They trade offers until the prices meet — or
          stop cleanly when they can&apos;t.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ScenarioButton
          onClick={() => start("converge")}
          disabled={loading}
          title="Limits overlap"
          detail="Buyer pays up to $4.80 · supplier sells from $4.20"
        />
        <ScenarioButton
          onClick={() => start("impasse")}
          disabled={loading}
          title="Limits don't overlap"
          detail="Buyer pays up to $3.90 · supplier sells from $4.20"
        />
      </div>
      {error && <p className="text-sm text-rose-600">Couldn&apos;t run the demo: {error}</p>}

      {data && (
        <>
          <ol className="flex flex-col gap-2">
            {data.outcome.rounds.map((r, i) => (
              <li
                key={i}
                className={cn("flex", r.role === "buyer" ? "justify-start" : "justify-end")}
              >
                <span
                  className={cn(
                    "rounded-2xl px-3 py-1.5 text-sm",
                    r.role === "buyer"
                      ? "rounded-bl-sm bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200"
                      : "rounded-br-sm bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100",
                  )}
                >
                  {r.role === "buyer" ? "Buyer offers" : "Supplier asks"} ${r.price.toFixed(2)}
                </span>
              </li>
            ))}
          </ol>
          {data.outcome.status === "agreed" ? (
            <Result
              ok
              title={`Deal at $${(data.outcome.price ?? 0).toFixed(2)} per unit`}
              text={`Agreed after ${data.outcome.rounds.length} offers, with no person in the loop. It now waits for a human to confirm.`}
            />
          ) : (
            <Result
              ok={false}
              title="No deal"
              text="The buyer's limit is below the supplier's lowest price, so the agents stopped instead of overpaying."
            />
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-neutral-500">Technical details</summary>
            <div className="mt-2 flex flex-col gap-2 text-xs text-neutral-600 dark:text-neutral-400">
              <span>
                {data.policy_leak.length === 0
                  ? "No private field (like a walk-away price) was ever sent."
                  : `Leaked fields: ${data.policy_leak.join(", ")}`}
              </span>
              <span>
                Agreement: {data.card.agreement} ({data.card.agreed_by.length}/
                {data.card.required_parties.length}) · gap: {data.outcome.gap ?? "none"}
              </span>
              <code className="break-all rounded bg-neutral-100 p-2 font-mono text-[11px] dark:bg-neutral-900">
                {data.card.hash}
              </code>
              <pre className="overflow-x-auto rounded bg-neutral-100 p-2 font-mono text-[11px] dark:bg-neutral-900">
                {data.outcome.rounds.map((r) => `#${r.round} ${r.role} ${JSON.stringify(r.fields)}`).join("\n")}
              </pre>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export function ThreeFriends() {
  const { data, loading, error, run } = useRun<MultiResponse>();
  const start = (preset: "agree" | "no-match") => run("/api/negotiate-multi", { preset });

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div>
        <h2 className="text-lg font-semibold">Three friends pick a plan for the weekend</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Three agents, each for a different person. The plan counts only when all three say
          yes to the same thing.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ScenarioButton
          onClick={() => start("agree")}
          disabled={loading}
          title="Plans overlap"
          detail="All three are free on the same day"
        />
        <ScenarioButton
          onClick={() => start("no-match")}
          disabled={loading}
          title="Plans don't overlap"
          detail="No place suits all three"
        />
      </div>
      {error && <p className="text-sm text-rose-600">Couldn&apos;t run the demo: {error}</p>}

      {data && (
        <>
          <ol className="flex flex-col gap-2">
            {data.progression.map((p, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate font-medium">{agentName(p.author)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      p.agreement === "full" ? "bg-emerald-500" : "bg-sky-400",
                    )}
                    style={{ width: `${(p.agreed / Math.max(p.required, 1)) * 100}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-neutral-600 dark:text-neutral-400">
                  {p.agreed} of {p.required} agree
                </span>
              </li>
            ))}
          </ol>
          {data.status === "agreed" && data.terms ? (
            <>
              <Result ok title="Everyone agreed" text={data.final.summary} />
              <dl className="grid grid-cols-3 gap-3">
                {readableTerms(data.terms).map((t) => (
                  <div key={t.label}>
                    <dt className="text-xs text-neutral-500">{t.label}</dt>
                    <dd className="text-sm font-semibold">{t.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <Result
              ok={false}
              title="No plan everyone accepts"
              text={
                data.blocked_by.length > 0
                  ? `They couldn't find a ${data.blocked_by.join(", ")} that works for all three.`
                  : data.final.summary
              }
            />
          )}
        </>
      )}
    </section>
  );
}

