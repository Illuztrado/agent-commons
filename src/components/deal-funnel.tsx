"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { FunnelStage, HistoryStep, SupplierTone, SupplierView } from "@/lib/overview";
import type { AgentTrust } from "@/lib/agent-trust";
import { TrustBadges, TrustSummary } from "@/components/trust-badges";
import { cn } from "@/lib/utils";

/**
 * The deal funnel and the companies behind it, as one piece.
 *
 * A symmetric funnel — fixed trapezoids on one axis, so it reads as a funnel
 * whatever the numbers — where each stage shows how many companies reached it,
 * their combined order value and the pass-through rate. Clicking a stage (or a
 * drop-off on the right) filters the company list below to exactly the
 * companies that number counts.
 */

type Filter = { kind: "stage"; index: number } | { kind: "dropped"; reason: "check" | "no-deal" } | null;

const HALF_WIDTHS = [170, 145, 118, 90, 62, 40];
const TONE = [
  "fill-sky-100 stroke-sky-300 dark:fill-sky-950 dark:stroke-sky-800",
  "fill-sky-100 stroke-sky-300 dark:fill-sky-950 dark:stroke-sky-800",
  "fill-sky-100 stroke-sky-300 dark:fill-sky-950 dark:stroke-sky-800",
  "fill-emerald-100 stroke-emerald-300 dark:fill-emerald-950 dark:stroke-emerald-800",
  "fill-neutral-100 stroke-neutral-400 dark:fill-neutral-900 dark:stroke-neutral-600",
];
const TONE_SELECTED = [
  "fill-sky-300 stroke-sky-600 dark:fill-sky-800 dark:stroke-sky-400",
  "fill-sky-300 stroke-sky-600 dark:fill-sky-800 dark:stroke-sky-400",
  "fill-sky-300 stroke-sky-600 dark:fill-sky-800 dark:stroke-sky-400",
  "fill-emerald-300 stroke-emerald-600 dark:fill-emerald-800 dark:stroke-emerald-400",
  "fill-neutral-300 stroke-neutral-600 dark:fill-neutral-700 dark:stroke-neutral-400",
];
const TEXT = [
  "fill-sky-900 dark:fill-sky-100",
  "fill-sky-900 dark:fill-sky-100",
  "fill-sky-900 dark:fill-sky-100",
  "fill-emerald-900 dark:fill-emerald-100",
  "fill-neutral-700 dark:fill-neutral-200",
];

const money = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 1 : 2).replace(/\.0+$/, "")}k` : `$${Math.round(n)}`;

export function DealFunnel({
  stages,
  suppliers,
  trusts,
  links,
}: {
  stages: FunnelStage[];
  suppliers: SupplierView[];
  trusts: Record<string, AgentTrust | null>;
  links: Record<string, string | null>;
}) {
  const [filter, setFilter] = useState<Filter>(null);

  const toggle = (next: NonNullable<Filter>) =>
    setFilter((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? null : next));

  const shown = suppliers.filter((s) => {
    if (!filter) return true;
    if (filter.kind === "stage") return s.reached >= filter.index;
    return s.dropped === filter.reason;
  });

  const droppedNames = (reason: "check" | "no-deal") =>
    suppliers.filter((s) => s.dropped === reason).map((s) => s.name);
  const drops = [
    { stage: 1, reason: "check" as const, title: "failed the check", names: droppedNames("check") },
    { stage: 2, reason: "no-deal" as const, title: "no deal", names: droppedNames("no-deal") },
  ].filter((d) => d.names.length > 0);

  const filterLabel = !filter
    ? null
    : filter.kind === "stage"
      ? stages[filter.index].label
      : filter.reason === "check"
        ? "Failed the background check"
        : "No deal";

  const cx = 340;
  const h = 50;
  const gap = 6;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <svg
          viewBox="0 0 700 300"
          className="w-full"
          role="group"
          aria-label="Deal funnel — select a stage to filter the companies below"
        >
          {stages.map((stage, i) => {
            const y = 10 + i * (h + gap);
            const top = HALF_WIDTHS[i];
            const bottom = HALF_WIDTHS[i + 1];
            const points = `${cx - top},${y} ${cx + top},${y} ${cx + bottom},${y + h} ${cx - bottom},${y + h}`;
            const selected = filter?.kind === "stage" && filter.index === i;
            return (
              <g
                key={stage.label}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${stage.label}: ${stage.count} companies, ${money(stage.value)}`}
                onClick={() => toggle({ kind: "stage", index: i })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle({ kind: "stage", index: i });
                  }
                }}
                className="group cursor-pointer outline-none"
              >
                <polygon
                  points={points}
                  strokeWidth={selected ? 2 : 1}
                  strokeDasharray={i === stages.length - 1 && !selected ? "4 3" : undefined}
                  className={cn(
                    "transition-colors group-hover:opacity-80 group-focus-visible:stroke-[3]",
                    selected ? TONE_SELECTED[i] : TONE[i],
                  )}
                />
                <text x={cx} y={y + 22} textAnchor="middle" className={cn("text-lg font-semibold", TEXT[i])}>
                  {stage.count}
                </text>
                <text x={cx} y={y + 39} textAnchor="middle" className={cn("text-[11px]", TEXT[i])}>
                  {money(stage.value)}
                </text>
                <text
                  x={cx - top - 14}
                  y={y + 22}
                  textAnchor="end"
                  className={cn(
                    "text-sm",
                    selected ? "fill-neutral-950 font-semibold dark:fill-white" : "fill-neutral-700 dark:fill-neutral-300",
                  )}
                >
                  {stage.label}
                </text>
                {stage.pct !== null && (
                  <text x={cx - top - 14} y={y + 38} textAnchor="end" className="fill-neutral-500 text-[11px]">
                    {stage.pct}% of previous step
                  </text>
                )}
              </g>
            );
          })}
          {drops.map((d) => {
            const y = 10 + d.stage * (h + gap) + h / 2;
            const x = cx + HALF_WIDTHS[d.stage] - 8;
            const selected = filter?.kind === "dropped" && filter.reason === d.reason;
            return (
              <g
                key={d.reason}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => toggle({ kind: "dropped", reason: d.reason })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle({ kind: "dropped", reason: d.reason });
                  }
                }}
                className="cursor-pointer outline-none hover:opacity-80"
              >
                <path d={`M${x} ${y} L${x + 30} ${y}`} strokeWidth={1.5} className="stroke-rose-500" />
                <path d={`M${x + 30} ${y - 4} L${x + 36} ${y} L${x + 30} ${y + 4} z`} className="fill-rose-500" />
                <text
                  x={x + 44}
                  y={y - 2}
                  className={cn(
                    "fill-rose-700 text-[13px] dark:fill-rose-400",
                    selected ? "font-bold underline" : "font-medium",
                  )}
                >
                  {d.names.length} {d.title}
                </text>
                <text x={x + 44} y={y + 14} className="fill-neutral-500 text-xs">
                  {d.names.join(", ")}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="text-center text-xs text-neutral-500">
          Click a stage to see which companies are in it.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">
            {filterLabel ? (
              <>
                {filterLabel} <span className="font-normal text-neutral-500">· {shown.length}</span>
              </>
            ) : (
              "Companies your agent is negotiating with"
            )}
          </h2>
          {filter ? (
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-400"
            >
              Show all {suppliers.length} companies
            </button>
          ) : (
            <span className="text-xs text-neutral-500">Click a company to see its agent and terms</span>
          )}
        </div>
        <div className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950">
          {shown.map((s) => (
            <SupplierRow
              key={s.roomId}
              supplier={s}
              trust={trusts[s.roomId] ?? null}
              link={links[s.roomId] ?? null}
            />
          ))}
          {shown.length === 0 && (
            <div className="p-6 text-center text-sm text-neutral-500">
              No companies at this stage yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const AVATAR_TONE: Record<SupplierTone, string> = {
  you: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  waiting: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  active: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  stopped: "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400",
  blocked: "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400",
};

const DOT_TONE: Record<SupplierTone, string> = {
  you: "bg-amber-500",
  waiting: "bg-sky-500",
  active: "bg-sky-400",
  done: "bg-emerald-500",
  stopped: "bg-rose-500",
  blocked: "bg-neutral-400",
};

const STEP_DOT: Record<HistoryStep["tone"], string> = {
  neutral: "border-neutral-400 bg-white dark:bg-neutral-900",
  good: "border-emerald-500 bg-emerald-500",
  bad: "border-rose-500 bg-rose-500",
  pending: "border-amber-500 bg-white dark:bg-neutral-900",
};

function History({ steps, link }: { steps: HistoryStep[]; link: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">History</span>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-white dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Open conversation <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : (
          <span className="text-xs text-neutral-400">The agents&apos; conversation isn&apos;t linked</span>
        )}
      </div>
      <ol className="flex flex-col">
        {steps.map((step, i) => (
          <li key={i} className="relative flex gap-3 pb-2 last:pb-0">
            {i < steps.length - 1 && (
              <span className="absolute left-[4.5px] top-3 h-full w-px bg-neutral-300 dark:bg-neutral-700" />
            )}
            <span className={cn("relative mt-1.5 size-2.5 shrink-0 rounded-full border-2", STEP_DOT[step.tone])} />
            <span
              className={cn(
                "text-sm",
                step.tone === "pending" ? "text-amber-700 dark:text-amber-400" : "text-neutral-700 dark:text-neutral-300",
              )}
            >
              {step.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SupplierRow({
  supplier: s,
  trust,
  link,
}: {
  supplier: SupplierView;
  trust: AgentTrust | null;
  link: string | null;
}) {
  const showTerms = s.dropped !== "check" && s.terms.length > 0;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 [&::-webkit-details-marker]:hidden">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            AVATAR_TONE[s.tone],
          )}
        >
          {s.initials}
        </div>
        <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
        {s.value !== null && (
          <span className="hidden text-sm tabular-nums text-neutral-500 md:block">
            ${s.value.toLocaleString("en-US")}
          </span>
        )}
        <span className="hidden sm:block">
          {trust ? (
            <TrustBadges badges={trust.badges} compact />
          ) : (
            <span className="text-[11px] text-neutral-400">no profile</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <span className={cn("size-2 rounded-full", DOT_TONE[s.tone])} />
          {s.status}
        </span>
        <span className="text-neutral-400 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="flex flex-col gap-3 bg-neutral-50 px-4 pb-4 pl-16 pt-1 dark:bg-neutral-900">
        <History steps={s.history} link={link} />
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
          <span className="text-neutral-500">Their agent:</span>
          {trust ? (
            <>
              <span className="font-medium">{trust.name}</span>
              <TrustBadges badges={trust.badges} />
              <TrustSummary badges={trust.badges} />
              {trust.lapsed && <span className="text-xs text-rose-600">profile expired</span>}
            </>
          ) : (
            <span className="text-neutral-500">profile not shared</span>
          )}
        </div>
        {showTerms && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {s.terms.map((t) => (
              <div key={t.label}>
                <dt className="text-xs text-neutral-500">{t.label}</dt>
                <dd className="text-sm font-medium">{t.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </details>
  );
}
