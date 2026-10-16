import type { ResultCard } from "./result-card";
import type { RoomStatus, RoomSummary } from "./transport";
import { canConfirm, findSignOff, type HumanSignOff } from "./human-signoff";

/**
 * The overview — one page a person can read in five seconds.
 *
 * Pure derivation over the same rooms, cards and sign-offs the board and the
 * dashboard read: a deal funnel, the agents and what each is doing, and the
 * deals waiting on the human. No new data and no state of its own, so the
 * overview cannot disagree with the room pages it links to.
 */

export interface OverviewRoom {
  room: RoomSummary;
  /** Merged cards for the room, as `mergeResultCards` returns them. */
  cards: ResultCard[];
}

export interface FunnelCounts {
  started: number;
  passedScreening: number;
  termsFound: number;
  allAgree: number;
  confirmed: number;
  /** Dropped before negotiating: no-match (e.g. flagged by screening). */
  blocked: number;
  /** Negotiated but no overlap: impasse. */
  noDeal: number;
}

export type AgentTone = "active" | "you" | "done" | "waiting" | "stopped" | "blocked";

export interface AgentView {
  id: string;
  name: string;
  initials: string;
  rooms: string[];
  tone: AgentTone;
  status: string;
  /** The room's own summary for a single-room agent; null when it runs several. */
  detail: string | null;
}

export interface PendingDeal {
  room: RoomSummary;
  card: ResultCard;
}

/** A room counts as closed once a human has signed off any of its cards. */
function isConfirmed(cards: ResultCard[], signOffs: HumanSignOff[]): boolean {
  return cards.some((card) => findSignOff(signOffs, card) !== undefined);
}

const FUNNEL_AT_LEAST: Record<RoomStatus, number> = {
  "no-match": 0,
  impasse: 1,
  negotiating: 1,
  partial: 2,
  agreed: 3,
};

export function funnelCounts(rooms: OverviewRoom[], signOffs: HumanSignOff[]): FunnelCounts {
  const reached = (stage: number) =>
    rooms.filter(({ room }) => FUNNEL_AT_LEAST[room.status] >= stage).length;
  return {
    started: rooms.length,
    passedScreening: reached(1),
    termsFound: reached(2),
    allAgree: reached(3),
    confirmed: rooms.filter(({ cards }) => isConfirmed(cards, signOffs)).length,
    blocked: rooms.filter(({ room }) => room.status === "no-match").length,
    noDeal: rooms.filter(({ room }) => room.status === "impasse").length,
  };
}

/**
 * Deals only the human can close: every required party agreed, and the card
 * stopped at the human step. A partial card stays with the agents.
 */
export function pendingDeals(rooms: OverviewRoom[], signOffs: HumanSignOff[]): PendingDeal[] {
  const out: PendingDeal[] = [];
  for (const { room, cards } of rooms) {
    const card = cards.find((c) => c.agreement === "full" && canConfirm(c, signOffs));
    if (card) out.push({ room, card });
  }
  return out;
}

/** `Northwind-Supply-Agent.demo` → `Northwind Supply`. */
export function agentName(id: string): string {
  const base = id.replace(/\.demo$/, "").replace(/-Agent$/, "");
  return base.replace(/[-_]+/g, " ").trim() || id;
}

export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

function singleRoomStatus(
  agent: string,
  room: RoomSummary,
  cards: ResultCard[],
  signOffs: HumanSignOff[],
): { tone: AgentTone; status: string } {
  if (isConfirmed(cards, signOffs)) return { tone: "done", status: "Deal closed" };
  switch (room.status) {
    case "agreed":
      return cards.some((c) => c.agreement === "full" && canConfirm(c, signOffs))
        ? { tone: "you", status: "Agreed · waiting for you" }
        : { tone: "done", status: "Agreed by all sides" };
    case "partial": {
      const card = cards.find((c) => c.status === "agreed");
      if (card && !card.agreed_by.includes(agent)) {
        return { tone: "active", status: "Still deciding" };
      }
      const left = room.required_parties - room.agreed_parties;
      return {
        tone: "waiting",
        status: `Agreed · waiting for ${left} more ${left === 1 ? "party" : "parties"}`,
      };
    }
    case "impasse":
      return { tone: "stopped", status: "Stopped · no deal" };
    case "no-match":
      return { tone: "blocked", status: "No match" };
    default:
      return { tone: "active", status: "Negotiating" };
  }
}

/** Every agent seen in any room, busiest first. */
export function agentViews(rooms: OverviewRoom[], signOffs: HumanSignOff[]): AgentView[] {
  const byAgent = new Map<string, OverviewRoom[]>();
  for (const entry of rooms) {
    for (const agent of entry.room.participants) {
      const list = byAgent.get(agent) ?? [];
      list.push(entry);
      byAgent.set(agent, list);
    }
  }

  const views: AgentView[] = [];
  for (const [id, entries] of byAgent) {
    const name = agentName(id);
    const base = { id, name, initials: initials(name), rooms: entries.map((e) => e.room.room_id) };
    if (entries.length > 1) {
      const waiting = pendingDeals(entries, signOffs).length;
      views.push({
        ...base,
        tone: "active",
        status:
          `Negotiating ${entries.length} deals in parallel` +
          (waiting > 0 ? ` · ${waiting} waiting for you` : ""),
        detail: null,
      });
    } else {
      const [{ room, cards }] = entries;
      views.push({ ...base, ...singleRoomStatus(id, room, cards, signOffs), detail: room.summary });
    }
  }
  return views.sort((a, b) => b.rooms.length - a.rooms.length);
}

const TERM_LABELS: Record<string, string> = {
  spec: "Item",
  quantity: "Quantity",
  unit_price: "Unit price",
  lead_time_days: "Delivery",
};

/** Card terms as a person reads them: labelled, with units. */
export function readableTerms(terms: Record<string, unknown>): { label: string; value: string }[] {
  return Object.entries(terms).map(([key, raw]) => {
    const label =
      TERM_LABELS[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
    let value = String(raw);
    if (typeof raw === "number") {
      if (key === "unit_price") value = `$${raw.toFixed(2)}`;
      else if (key === "lead_time_days") value = `${raw} days`;
      else value = raw.toLocaleString("en-US");
    }
    return { label, value };
  });
}
