import Link from "next/link";
import { getTransport, type RoomStatus, type RoomSummary } from "@/lib/transport";
import { mergeResultCards, type ResultCard } from "@/lib/result-card";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { HashRecompute } from "@/components/hash-recompute";
import { DATA_PROVENANCE } from "@/lib/scenarios";

/**
 * Human-centric dashboard — an extra view over the same stateless result layer.
 *
 * Three things a person needs, in the order they need them: what is waiting on
 * them, how the rooms broke down, and the verifiable cards behind each result.
 * Still outcomes only: no transcripts, no message stream, no filters. Data comes
 * from the existing Transport, and the hash check reuses canonical.ts.
 */

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<RoomStatus, "green" | "amber" | "red" | "neutral" | "blue"> = {
  agreed: "green",
  partial: "amber",
  impasse: "red",
  "no-match": "neutral",
  negotiating: "blue",
};

function statusLabel(status: RoomStatus, required: number, agreed: number): string {
  switch (status) {
    case "agreed":
      return "agreed";
    case "partial":
      return `partial ${agreed}/${required}`;
    case "impasse":
      return "impasse";
    case "no-match":
      return "no-match";
    default:
      return "negotiating";
  }
}

/** Funnel order: a room either progresses to agreement or lands terminal. */
const LANES: RoomStatus[] = ["negotiating", "partial", "agreed", "impasse", "no-match"];

const LANE_LABEL: Record<RoomStatus, string> = {
  negotiating: "Negotiating",
  partial: "Partial",
  agreed: "Agreed",
  impasse: "Impasse",
  "no-match": "No match",
};

/**
 * `awaiting_signature` is not a room status — it is a card's `next_step`, set by
 * the negotiation engine once agents are done and only a human is left. The
 * multi-party engine uses the sibling value `awaiting_confirmation`.
 */
const HUMAN_STEPS = new Set(["awaiting_signature", "awaiting_confirmation"]);

function pendingHumanStep(cards: ResultCard[]): string | null {
  for (const card of cards) {
    if (card.next_step && HUMAN_STEPS.has(card.next_step)) return card.next_step;
  }
  return null;
}

/** Room-level tone/label, but for a single card: partial agreement is its own visible state. */
function cardView(card: ResultCard): { tone: "green" | "amber" | "red" | "neutral"; label: string } {
  if (card.status === "agreed" && card.agreement === "partial") {
    return {
      tone: "amber",
      label: `partial ${card.agreed_by.length}/${card.required_parties.length}`,
    };
  }
  if (card.status === "agreed") return { tone: "green", label: "agreed" };
  if (card.status === "impasse") return { tone: "red", label: "impasse" };
  return { tone: "neutral", label: "no-match" };
}

export default async function DashboardPage() {
  const transport = getTransport();
  const rooms = await transport.listRooms();
  const rawCards = await Promise.all(
    rooms.map((room) => transport.listResultCards(room.room_id)),
  );

  const entries = rooms.map((room, i) => {
    const cards = mergeResultCards(rawCards[i]);
    return { room, cards, step: pendingHumanStep(cards) };
  });

  const queue = entries.filter((e) => e.step !== null);

  const lanes = LANES.map((status) => ({
    status,
    rooms: rooms.filter((room) => room.status === status),
  }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Negotiation dashboard</h1>
          <Badge tone="blue">human hand-off</Badge>
        </div>
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          The same result layer as the{" "}
          <Link href="/" className="text-sky-700 hover:underline dark:text-sky-400">
            results board
          </Link>
          , read from the human side: what is waiting on you, how the rooms broke
          down, and the signed cards behind every number. No conversation is shown —
          agents negotiate, and a person appears only at the end.
        </p>
      </header>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Needs your signature</CardTitle>
          <span className="text-xs text-neutral-500">
            {queue.length} of {rooms.length} rooms
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-neutral-500">
            These rooms have an agent-posted outcome that only a human can sign off.
          </p>

          {queue.map(({ room, step }) => (
            <div
              key={room.room_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/room/${room.room_id}`}
                    className="font-medium text-sky-700 hover:underline dark:text-sky-400"
                  >
                    {room.room_id}
                  </Link>
                  <Badge tone={STATUS_TONE[room.status]}>
                    {statusLabel(room.status, room.required_parties, room.agreed_parties)}
                  </Badge>
                  <span className="font-mono text-[11px] text-neutral-500">{step}</span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  {room.summary}
                </p>
              </div>
              {/* Signature slot: WS-7 wires the real Confirm action onto this row. */}
              <Button
                disabled
                title="Confirmation is wired with the signature flow"
                className="cursor-not-allowed opacity-50"
              >
                Confirm
              </Button>
            </div>
          ))}

          {queue.length === 0 && (
            <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
              Nothing is waiting on a human right now.
            </div>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Outcome funnel
          </h2>
          <span className="text-xs text-neutral-500">
            negotiating → partial → agreed, or terminal
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {lanes.map(({ status, rooms: laneRooms }) => (
            <div
              key={status}
              className="flex min-w-0 flex-col gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {LANE_LABEL[status]}
                </span>
                <span className="font-mono text-xs text-neutral-500">{laneRooms.length}</span>
              </div>
              {laneRooms.map((room) => (
                <LaneChip key={room.room_id} room={room} />
              ))}
              {laneRooms.length === 0 && (
                <p className="text-xs text-neutral-400 dark:text-neutral-500">No rooms</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Result cards
          </h2>
          <span className="text-xs text-neutral-500">
            Recompute any hash from its terms alone
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {entries.flatMap(({ room, cards }) =>
            cards.map((card) => {
              const view = cardView(card);
              return (
                <Card key={`${room.room_id}-${card.hash}-${card.author}`}>
                  <CardHeader className="flex-row items-center justify-between gap-2 p-4">
                    <CardTitle className="min-w-0 truncate text-sm">
                      <Link
                        href={`/room/${room.room_id}`}
                        className="text-sky-700 hover:underline dark:text-sky-400"
                      >
                        {room.room_id}
                      </Link>
                    </CardTitle>
                    <Badge tone={view.tone}>{view.label}</Badge>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 px-4 pb-4">
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">
                      {card.summary}
                    </p>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(card.terms).map(([k, v]) => (
                        <div key={k} className="flex min-w-0 flex-col">
                          <dt className="text-neutral-500">{k}</dt>
                          <dd className="break-all font-mono">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                    <HashRecompute terms={card.terms} storedHash={card.hash} />
                    <div className="flex flex-col gap-0.5 text-xs text-neutral-500">
                      <span>
                        author: <span className="font-mono">{card.author}</span>
                      </span>
                      <span>
                        agreed:{" "}
                        <span className="font-mono">
                          {card.agreed_by.length > 0 ? card.agreed_by.join(", ") : "none yet"}
                        </span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            }),
          )}
        </div>

        {entries.every((e) => e.cards.length === 0) && (
          <Card>
            <CardContent className="pt-5 text-sm text-neutral-500">
              No result cards posted yet.
            </CardContent>
          </Card>
        )}
      </section>

      <footer className="flex flex-col gap-1 text-xs text-neutral-500">
        <span>
          Every hash on this page is recomputable from the terms it sits under, by any
          party, using the same canonical form the seed used to build the card.
        </span>
        <span>{DATA_PROVENANCE}</span>
      </footer>
    </main>
  );
}

function LaneChip({ room }: { room: RoomSummary }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-950">
      <Link
        href={`/room/${room.room_id}`}
        className="truncate text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
      >
        {room.room_id}
      </Link>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={STATUS_TONE[room.status]}>
          {statusLabel(room.status, room.required_parties, room.agreed_parties)}
        </Badge>
        <span className="text-[11px] text-neutral-500">{room.participants.length} parties</span>
      </div>
      <p className="line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400">{room.summary}</p>
    </div>
  );
}
