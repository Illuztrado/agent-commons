import Link from "next/link";
import { notFound } from "next/navigation";
import { getTransport } from "@/lib/transport";
import { mergeResultCards } from "@/lib/result-card";
import { recomputeHash } from "@/lib/seed";
import { assessCard, type AgentCard } from "@/lib/agent-card";
import {
  demoBuyerCard,
  demoExpiredCard,
  demoFlaggedCard,
  verifyCard,
} from "@/lib/agent-card-demo";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

/**
 * Room page — the core screen.
 *
 * Result cards on the left; participants on the right. Verification is shown
 * claim-by-claim: evidence / self-reported / unverified / lapsed. There are no
 * bare booleans — a receiving agent (and the judge) sees exactly what is
 * checkable.
 */

function cardsForRoom(roomId: string): AgentCard[] {
  if (roomId === "room-shell") return [demoBuyerCard(), demoFlaggedCard()];
  if (roomId === "room-northwind") return [demoBuyerCard(), demoExpiredCard()];
  return [demoBuyerCard()];
}

const STATUS_TONE = {
  evidence: "green",
  self_reported: "amber",
  unverified: "neutral",
} as const;

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const transport = getTransport();
  const rooms = await transport.listRooms();
  const room = rooms.find((r) => r.room_id === id);
  if (!room) notFound();

  const cards = await transport.listResultCards(id);
  const merged = mergeResultCards(cards);

  const agentCards = cardsForRoom(id).map((card) => ({
    card,
    assessment: assessCard(card, verifyCard(card)),
  }));

  const flagged = agentCards.some(
    (c) =>
      c.card.claims.screening.status === "evidence" &&
      c.card.claims.screening.evidence?.payload.matched === true,
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex items-center gap-3 text-sm">
        <Link href="/" className="text-sky-700 hover:underline dark:text-sky-400">
          ← Results board
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="font-medium">{room.room_id}</span>
      </div>

      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{room.room_id}</h1>
          <Badge tone="neutral">{room.scenario}</Badge>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{room.summary}</p>
        {flagged && (
          <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            Screening flag: a counterparty&apos;s card trips the synthetic list.
            Negotiation is held until a human clears it.
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="flex flex-col gap-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Result cards
          </h2>
          {merged.map((card) => {
            const recomputed = recomputeHash(card);
            const hashOk = recomputed === card.hash;
            return (
              <Card key={card.hash + card.author}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm">
                    {card.status}
                    <span className="ml-2 font-normal text-neutral-500">
                      agreement: {card.agreement} ({card.agreed_by.length}/
                      {card.required_parties.length})
                    </span>
                  </CardTitle>
                  <Badge tone={hashOk ? "green" : "red"}>
                    {hashOk ? "hash recomputes" : "hash mismatch"}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">{card.summary}</p>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(card.terms).map(([k, v]) => (
                      <div key={k} className="flex flex-col">
                        <dt className="text-neutral-500">{k}</dt>
                        <dd className="font-mono">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-neutral-500">terms hash</span>
                    <code className="break-all rounded bg-neutral-100 p-2 font-mono text-[11px] dark:bg-neutral-900">
                      {card.hash}
                    </code>
                  </div>
                  <div className="text-xs text-neutral-500">
                    next step: {card.next_step ?? "none"}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {merged.length === 0 && (
            <Card>
              <CardContent className="pt-5 text-sm text-neutral-500">
                Negotiating — no result card posted yet.
              </CardContent>
            </Card>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Participants
          </h2>
          {agentCards.map(({ card, assessment }) => (
            <Card key={card.agent_id}>
              <CardHeader className="gap-2 p-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{card.display_name}</CardTitle>
                  <Badge tone={assessment.lapsed ? "amber" : "blue"}>
                    {assessment.lapsed ? "claims lapsed" : assessment.level}
                  </Badge>
                </div>
                <div className="text-xs text-neutral-500">
                  owner: {card.owner.name}
                  {assessment.lapsed && " · expired/revoked"}
                </div>
                <ul className="mt-1 flex flex-col gap-1">
                  {assessment.claims.map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        <span className="font-mono text-[10px] text-neutral-400">{c.level}</span>{" "}
                        {c.key}
                      </span>
                      <Badge tone={STATUS_TONE[c.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                        {c.label}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardHeader>
            </Card>
          ))}
          <Card>
            <CardContent className="pt-5 text-xs text-neutral-500">
              Each claim is shown as evidence / self-reported / unverified — never a
              bare boolean. L0 key authentication is separate from the authority
              claims (L1–L3), so a lapsed card still authenticates its messages.
              <br />
              <br />
              An agent discloses only what <em>its own</em> owner policy allows — a
              counterparty&apos;s card is never authorization for us to share our data.
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
