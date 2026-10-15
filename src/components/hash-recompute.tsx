"use client";

import { useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import {
  recomputeFromTerms,
  type RecomputeResult,
} from "@/app/dashboard/actions";

/**
 * One result card's stored hash, plus the recomputable check.
 *
 * `terms` is handed to the client deliberately: a hash is only worth showing if
 * any party can recompute it from the terms alone. The comparison itself runs on
 * the server through the shared canonicalizer (see dashboard/actions.ts).
 */

export function HashRecompute({
  terms,
  storedHash,
}: {
  terms: Record<string, unknown>;
  storedHash: string;
}) {
  const [result, setResult] = useState<RecomputeResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  async function run() {
    setFailed(false);
    try {
      setResult(await recomputeFromTerms({ terms, storedHash }));
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-neutral-500">terms hash</span>
        <div className="flex items-center gap-2">
          {result ? (
            <Badge tone={result.match ? "green" : "red"}>
              {result.match ? "match" : "mismatch"}
            </Badge>
          ) : failed ? (
            <Badge tone="neutral">recompute failed</Badge>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => startTransition(run)}
            disabled={pending}
            className="border border-neutral-200 px-2.5 py-1 text-xs dark:border-neutral-800"
          >
            {pending ? "Recomputing…" : "Recompute"}
          </Button>
        </div>
      </div>

      <code className="block break-all rounded bg-neutral-100 p-2 font-mono text-[11px] dark:bg-neutral-900">
        {storedHash}
      </code>

      {result && !result.match && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-rose-700 dark:text-rose-300">
            recomputed from terms
          </span>
          <code className="block break-all rounded bg-rose-50 p-2 font-mono text-[11px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {result.recomputed}
          </code>
        </div>
      )}

      {result && result.match && (
        <p className="text-xs text-neutral-500">
          Recomputed from these terms and identical to the stored hash.
        </p>
      )}

      {failed && (
        <p className="text-xs text-neutral-500">
          Recompute needs the server (hashing uses node:crypto). Try again.
        </p>
      )}
    </div>
  );
}
