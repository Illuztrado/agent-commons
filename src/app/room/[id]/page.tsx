import Link from "next/link";
import { notFound } from "next/navigation";
import { getTransport } from "@/lib/transport";
import { mergeResultCards } from "@/lib/result-card";
import { recomputeHash } from "@/lib/seed";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

/**
 * Room page — the core screen.
 *
 * Left: the result cards for this room (the machine-readable outcomes).
 * Right: participants and their verification level (agent cards land in D2).
 * The display rule is enforced here: "agreed" only when every required party
 * signed the same hash; otherwise it shows partial / pending.
 */

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
          {room.participants.map((p) => (
            <Card key={p}>
              <CardHeader className="gap-1 p-4">
                <CardTitle className="text-sm">{p}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge tone="blue">L0</Badge>
                  <span className="text-xs text-neutral-500">
                    self-declared, self-signed
                  </span>
                </div>
              </CardHeader>
            </Card>
          ))}
          <Card>
            <CardContent className="pt-5 text-xs text-neutral-500">
              Verification badges describe what each level actually is. A signed
              self-declaration proves key control — not real-world identity.
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
