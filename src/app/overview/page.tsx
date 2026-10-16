import Link from "next/link";
import { listRooms, readResultCards } from "@/lib/outcome-service";
import { mergeResultCards } from "@/lib/result-card";
import { getSignOffTransport } from "@/lib/sign-off-transport";
import {
  agentName,
  agentViews,
  funnelCounts,
  initials,
  pendingDeals,
  readableTerms,
  type AgentTone,
  type AgentView,
  type FunnelCounts,
  type PendingDeal,
} from "@/lib/overview";
import { confirmSignOff } from "@/app/room/[id]/actions";
import { DATA_PROVENANCE } from "@/lib/scenarios";
import { cn } from "@/lib/utils";

/**
 * Overview — the human's first screen.
 *
 * Three questions, top to bottom: how are the deals going (funnel), what are
 * the agents doing (one card per agent), and what is waiting on me (deals to
 * confirm). Everything is derived in `@/lib/overview` from the same rooms,
 * cards and sign-offs the board and the room pages read.
 */

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const rooms = await listRooms();
  const signOffs = await getSignOffTransport().listSignOffs();
  const rawCards = await Promise.all(rooms.map((room) => readResultCards(room.room_id)));
  const entries = rooms.map((room, i) => ({ room, cards: mergeResultCards(rawCards[i]) }));

  const funnel = funnelCounts(entries, signOffs);
  const agents = agentViews(entries, signOffs);
  const pending = pendingDeals(entries, signOffs);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Your agents are running {funnel.started} negotiations.{" "}
          {pending.length === 0
            ? "Nothing needs your decision right now."
            : `${pending.length} ${pending.length === 1 ? "deal needs" : "deals need"} your decision.`}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Agents at work" value={agents.length} />
        <Metric label="Negotiations" value={funnel.started} />
        <Metric label="Waiting for you" value={pending.length} highlight={pending.length > 0} />
        <Metric label="Closed deals" value={funnel.confirmed} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="Deal funnel" note={`${funnel.started} negotiations`} />
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <Funnel counts={funnel} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="Agents" note={`${agents.length} agents`} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle
          title="Waiting for you"
          note={`${pending.length} ${pending.length === 1 ? "deal" : "deals"}`}
        />
        {pending.map((deal) => (
          <DealCard key={`${deal.room.room_id}-${deal.card.hash}`} deal={deal} />
        ))}
        {pending.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Nothing is waiting on you. Your agents will bring the next deal here.
          </div>
        )}
      </section>

      <footer className="text-xs text-neutral-500">{DATA_PROVENANCE}</footer>
    </main>
  );
}

function SectionTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <span className="text-xs text-neutral-500">{note}</span>
    </div>
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
 * funnel whatever the numbers are. Labels sit to the left, drop-offs to the right.
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

function Funnel({ counts }: { counts: FunnelCounts }) {
  const cx = 340;
  const h = 46;
  const gap = 6;
  const stages = [
    { label: "Started", value: counts.started },
    { label: "Passed screening", value: counts.passedScreening },
    { label: "Terms found", value: counts.termsFound },
    { label: "All sides agree", value: counts.allAgree },
    { label: "Confirmed by you", value: counts.confirmed },
  ];
  const drops = [
    { stage: 1, lines: [`${counts.blocked} blocked`, "by screening"], value: counts.blocked },
    { stage: 2, lines: [`${counts.noDeal} no deal`, "price or deadline"], value: counts.noDeal },
  ];

  return (
    <svg
      viewBox="0 0 680 280"
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
      {drops
        .filter((d) => d.value > 0)
        .map((d) => {
          const y = 10 + d.stage * (h + gap) + h / 2;
          const x = cx + FUNNEL_HALF_WIDTHS[d.stage] - 8;
          return (
            <g key={d.stage}>
              <path
                d={`M${x} ${y} L${x + 36} ${y}`}
                strokeWidth={1.5}
                className="stroke-rose-500"
              />
              <path d={`M${x + 36} ${y - 4} L${x + 42} ${y} L${x + 36} ${y + 4} z`} className="fill-rose-500" />
              <text x={x + 50} y={y - 2} className="fill-rose-700 text-[13px] font-medium dark:fill-rose-400">
                {d.lines[0]}
              </text>
              <text x={x + 50} y={y + 14} className="fill-neutral-500 text-xs">
                {d.lines[1]}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

const AVATAR_TONE: Record<AgentTone, string> = {
  active: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  you: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  waiting: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  stopped: "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400",
  blocked: "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400",
};

const DOT_TONE: Record<AgentTone, string> = {
  active: "bg-sky-500",
  you: "bg-amber-500",
  waiting: "bg-sky-400",
  done: "bg-emerald-500",
  stopped: "bg-rose-500",
  blocked: "bg-neutral-400",
};

function AgentCard({ agent }: { agent: AgentView }) {
  const busy = agent.rooms.length > 1;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border bg-white p-4 dark:bg-neutral-950",
        busy ? "border-sky-300 dark:border-sky-800" : "border-neutral-200 dark:border-neutral-800",
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          AVATAR_TONE[agent.tone],
        )}
      >
        {agent.initials}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{agent.name}</span>
          {busy ? (
            <span className="shrink-0 text-xs text-neutral-500">{agent.rooms.length} deals</span>
          ) : (
            <Link
              href={`/room/${agent.rooms[0]}`}
              className="shrink-0 text-xs text-sky-700 hover:underline dark:text-sky-400"
            >
              Open deal
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <span className={cn("size-2 shrink-0 rounded-full", DOT_TONE[agent.tone])} />
          {agent.status}
        </div>
        {agent.detail && (
          <p className="line-clamp-2 text-xs text-neutral-500">{agent.detail}</p>
        )}
      </div>
    </div>
  );
}

function DealCard({ deal }: { deal: PendingDeal }) {
  const { room, card } = deal;
  const parties = room.participants.map(agentName);
  const terms = readableTerms(card.terms);
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {parties.map((name) => (
              <div
                key={name}
                className="flex size-9 items-center justify-center rounded-full border-2 border-white bg-sky-100 text-xs font-semibold text-sky-800 dark:border-neutral-950 dark:bg-sky-950 dark:text-sky-300"
              >
                {initials(name)}
              </div>
            ))}
          </div>
          <div>
            <div className="font-medium">{parties.join(" ↔ ")}</div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">{card.summary}</div>
          </div>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          ✓ {card.agreed_by.length} of {card.required_parties.length} agreed
        </span>
      </div>
      <dl
        className="grid border-y border-neutral-200 dark:border-neutral-800"
        style={{ gridTemplateColumns: `repeat(${Math.min(terms.length, 4)}, minmax(0, 1fr))` }}
      >
        {terms.map((t, i) => (
          <div
            key={t.label}
            className={cn(
              "px-5 py-3",
              i % 4 !== 0 && "border-l border-neutral-200 dark:border-neutral-800",
            )}
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
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          <span className="text-emerald-600 dark:text-emerald-400">●</span> Signed by every agent
          and verifiable ·{" "}
          <Link href={`/room/${room.room_id}`} className="underline hover:text-neutral-900 dark:hover:text-neutral-100">
            show proof
          </Link>
        </span>
        <div className="flex items-center gap-2">
          <Link
            href={`/room/${room.room_id}`}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Open deal
          </Link>
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
          >
            Confirm deal
          </button>
        </div>
      </form>
    </div>
  );
}
