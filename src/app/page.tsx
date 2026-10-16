import { listRooms, readResultCards } from "@/lib/outcome-service";
import { mergeResultCards } from "@/lib/result-card";
import { getSignOffTransport } from "@/lib/sign-off-transport";
import {
  buildOverview,
  initials,
  readableTerms,
  type FunnelCounts,
  type PendingDeal,
  type SupplierTone,
  type SupplierView,
} from "@/lib/overview";
import { confirmSignOff } from "@/app/room/[id]/actions";
import { GuidePanel } from "@/components/guide-panel";
import { TrustBadges, TrustSummary } from "@/components/trust-badges";
import { counterpartyTrust, type AgentTrust } from "@/lib/agent-trust";
import { DATA_PROVENANCE } from "@/lib/scenarios";
import { cn } from "@/lib/utils";

/**
 * Overview — the human's first screen.
 *
 * One story, three questions: how are the purchases going (funnel), where does
 * each supplier stand (one row each, details on click), and what is waiting on
 * me (deals to confirm). Everything is derived in `@/lib/overview` from the
 * same rooms, cards and sign-offs the board and the room pages read.
 */

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const rooms = await listRooms();
  const signOffs = await getSignOffTransport().listSignOffs();
  const rawCards = await Promise.all(rooms.map((room) => readResultCards(room.room_id)));
  const entries = rooms.map((room, i) => ({ room, cards: mergeResultCards(rawCards[i]) }));

  const { buyer, funnel, suppliers, pending } = buildOverview(entries, signOffs);
  const dropped = suppliers.filter((s) => s.dropped !== null);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
          Your buying agent{buyer ? ` (${buyer.name})` : ""} is negotiating with{" "}
          {suppliers.length} suppliers for parts orders. Here&apos;s where each one stands.
        </p>
        {pending.length > 0 && (
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {pending.length === 1
              ? "One deal is ready and waiting for your confirmation."
              : `${pending.length} deals are ready and waiting for your confirmation.`}
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Suppliers contacted" value={funnel.contacted} />
        <Metric label="Waiting for you" value={pending.length} highlight={pending.length > 0} />
        <Metric label="Deals closed" value={funnel.confirmed} />
        <Metric label="Dropped out" value={dropped.length} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">How the deals are going</h2>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <Funnel counts={funnel} suppliers={suppliers} />
        </div>
      </section>

      {pending.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold tracking-tight">Waiting for you</h2>
          {pending.map((deal) => (
            <DealCard key={`${deal.room.room_id}-${deal.card.hash}`} deal={deal} />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">
            Companies your agent is negotiating with
          </h2>
          <span className="text-xs text-neutral-500">Click a company to see its agent and terms</span>
        </div>
        <div className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950">
          {suppliers.map((s) => (
            <SupplierRow
              key={s.roomId}
              supplier={s}
              trust={counterpartyTrust(s.roomId)}
            />
          ))}
        </div>
      </section>

      <section>
        <GuidePanel />
      </section>

      <footer className="text-xs text-neutral-500">{DATA_PROVENANCE}</footer>
    </main>
  );
}

function Metric({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl p-4",
        highlight
          ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "bg-neutral-100 dark:bg-neutral-900",
      )}
    >
      <div
        className={cn(
          "text-xs",
          highlight ? "text-amber-700 dark:text-amber-400" : "text-neutral-600 dark:text-neutral-400",
        )}
      >
        {label}
      </div>
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

/**
 * A symmetric funnel: fixed trapezoids centred on one axis, so it reads as a
 * funnel whatever the numbers are. Labels sit to the left; to the right, the
 * suppliers that dropped out at that step, by name.
 */
const FUNNEL_HALF_WIDTHS = [170, 145, 118, 90, 62, 40];
const FUNNEL_TONES = [
  "fill-sky-100 stroke-sky-300 dark:fill-sky-950 dark:stroke-sky-800",
  "fill-sky-100 stroke-sky-300 dark:fill-sky-950 dark:stroke-sky-800",
  "fill-sky-100 stroke-sky-300 dark:fill-sky-950 dark:stroke-sky-800",
  "fill-emerald-100 stroke-emerald-300 dark:fill-emerald-950 dark:stroke-emerald-800",
  "fill-neutral-100 stroke-neutral-400 dark:fill-neutral-900 dark:stroke-neutral-600",
];
const FUNNEL_TEXT = [
  "fill-sky-800 dark:fill-sky-200",
  "fill-sky-800 dark:fill-sky-200",
  "fill-sky-800 dark:fill-sky-200",
  "fill-emerald-800 dark:fill-emerald-200",
  "fill-neutral-700 dark:fill-neutral-300",
];

function Funnel({ counts, suppliers }: { counts: FunnelCounts; suppliers: SupplierView[] }) {
  const cx = 340;
  const h = 46;
  const gap = 6;
  const stages = [
    { label: "Suppliers contacted", value: counts.contacted },
    { label: "Passed background check", value: counts.passedCheck },
    { label: "Supplier accepted terms", value: counts.supplierAccepted },
    { label: "Both sides agreed", value: counts.bothAgreed },
    { label: "Confirmed by you", value: counts.confirmed },
  ];
  const names = (kind: SupplierView["dropped"]) =>
    suppliers.filter((s) => s.dropped === kind).map((s) => s.name);
  const failedCheck = names("check");
  const noDeal = names("no-deal");
  const drops = [
    { stage: 1, title: `${failedCheck.length} failed the check`, names: failedCheck },
    { stage: 2, title: `${noDeal.length} no deal`, names: noDeal },
  ].filter((d) => d.names.length > 0);

  return (
    <svg
      viewBox="0 0 700 280"
      className="w-full"
      role="img"
      aria-label={stages.map((s) => `${s.label}: ${s.value}`).join(", ")}
    >
      {stages.map((stage, i) => {
        const y = 10 + i * (h + gap);
        const top = FUNNEL_HALF_WIDTHS[i];
        const bottom = FUNNEL_HALF_WIDTHS[i + 1];
        const points = `${cx - top},${y} ${cx + top},${y} ${cx + bottom},${y + h} ${cx - bottom},${y + h}`;
        return (
          <g key={stage.label}>
            <polygon
              points={points}
              strokeWidth={1}
              strokeDasharray={i === stages.length - 1 ? "4 3" : undefined}
              className={FUNNEL_TONES[i]}
            />
            <text
              x={cx}
              y={y + h / 2 + 6}
              textAnchor="middle"
              className={cn("text-lg font-semibold", FUNNEL_TEXT[i])}
            >
              {stage.value}
            </text>
            <text
              x={cx - top - 14}
              y={y + h / 2 + 5}
              textAnchor="end"
              className="fill-neutral-700 text-sm dark:fill-neutral-300"
            >
              {stage.label}
            </text>
          </g>
        );
      })}
      {drops.map((d) => {
        const y = 10 + d.stage * (h + gap) + h / 2;
        const x = cx + FUNNEL_HALF_WIDTHS[d.stage] - 8;
        return (
          <g key={d.stage}>
            <path d={`M${x} ${y} L${x + 30} ${y}`} strokeWidth={1.5} className="stroke-rose-500" />
            <path d={`M${x + 30} ${y - 4} L${x + 36} ${y} L${x + 30} ${y + 4} z`} className="fill-rose-500" />
            <text x={x + 44} y={y - 2} className="fill-rose-700 text-[13px] font-medium dark:fill-rose-400">
              {d.title}
            </text>
            <text x={x + 44} y={y + 14} className="fill-neutral-500 text-xs">
              {d.names.join(", ")}
            </text>
          </g>
        );
      })}
    </svg>
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

function SupplierRow({ supplier: s, trust }: { supplier: SupplierView; trust: AgentTrust | null }) {
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
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{s.summary}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
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

function DealCard({ deal }: { deal: PendingDeal }) {
  const { room, card, supplier } = deal;
  const terms = readableTerms(card.terms);
  return (
    <div className="overflow-hidden rounded-2xl border border-amber-300 bg-white dark:border-amber-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {initials(supplier)}
          </div>
          <div>
            <div className="font-medium">Deal with {supplier}</div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Your agent and the supplier both agreed. Confirm to close the deal.
            </div>
          </div>
        </div>
      </div>
      <dl
        className="grid border-y border-neutral-200 dark:border-neutral-800"
        style={{ gridTemplateColumns: `repeat(${Math.min(terms.length, 4)}, minmax(0, 1fr))` }}
      >
        {terms.map((t, i) => (
          <div
            key={t.label}
            className={cn("px-5 py-3", i % 4 !== 0 && "border-l border-neutral-200 dark:border-neutral-800")}
          >
            <dt className="text-xs text-neutral-500">{t.label}</dt>
            <dd className="text-base font-semibold">{t.value}</dd>
          </div>
        ))}
      </dl>
      <form
        action={confirmSignOff}
        className="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 px-5 py-3 dark:bg-neutral-900"
      >
        <input type="hidden" name="room_id" value={room.room_id} />
        <input type="hidden" name="hash" value={card.hash} />
        <span className="text-xs text-neutral-500">
          Demo-level confirmation of these exact terms — no legal signature validity.
        </span>
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          Confirm deal
        </button>
      </form>
    </div>
  );
}
