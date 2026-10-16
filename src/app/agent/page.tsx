import { listRooms, readResultCards } from "@/lib/outcome-service";
import { mergeResultCards } from "@/lib/result-card";
import { getSignOffTransport } from "@/lib/sign-off-transport";
import { buildOverview } from "@/lib/overview";
import { buyerTrust, counterpartyTrust } from "@/lib/agent-trust";
import { TrustBadges, TrustLegend, TrustSummary } from "@/components/trust-badges";
import { YourAgents, type AgentSummary } from "@/components/your-agents";

/**
 * Agents — yours, and the ones they negotiate with.
 *
 * Every agent shows its four trust checks as badges: verified, only claimed,
 * or failed/expired. Counterparties that shared no card are shown as such,
 * never given badges they did not earn.
 */

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const rooms = await listRooms();
  const signOffs = await getSignOffTransport().listSignOffs();
  const entries = await Promise.all(
    rooms.map(async (room) => ({ room, cards: mergeResultCards(await readResultCards(room.room_id)) })),
  );
  const { suppliers } = buildOverview(entries, signOffs);

  const buyer = buyerTrust();
  const seeded: AgentSummary = {
    id: "seeded-buyer",
    name: buyer.name,
    company: buyer.company,
    role: `buying parts · negotiating with ${suppliers.length} companies`,
    badges: buyer.badges,
  };

  const counterparts = suppliers.map((s) => ({ supplier: s, trust: counterpartyTrust(s.roomId) }));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
          The agents that negotiate for you, and the ones they negotiate with. Before talking,
          agents check each other&apos;s badges to decide whether to trust each other.
        </p>
      </header>

      <YourAgents seeded={seeded} />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">
          Agents you&apos;re negotiating with{" "}
          <span className="font-normal text-neutral-500">· {counterparts.length}</span>
        </h2>
        <div className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950">
          {counterparts.map(({ supplier, trust }) => (
            <div key={supplier.roomId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                {supplier.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{trust?.name ?? `${supplier.name} agent`}</div>
                <div className="text-xs text-neutral-500">{supplier.name}</div>
              </div>
              {trust ? (
                <div className="flex flex-col items-end gap-1">
                  <TrustBadges badges={trust.badges} />
                  <span className="text-xs">
                    <TrustSummary badges={trust.badges} />
                    {trust.lapsed && <span className="text-rose-600"> · profile expired</span>}
                  </span>
                </div>
              ) : (
                <span className="rounded-full border border-dashed border-neutral-300 px-2.5 py-0.5 text-xs text-neutral-500 dark:border-neutral-700">
                  Profile not shared
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-semibold">What the badges mean</h2>
        <TrustLegend />
      </section>
    </main>
  );
}
