import type { ResultCard } from "./result-card";
import type { RoomStatus, RoomSummary } from "./transport";
import { canConfirm, findSignOff, type HumanSignOff } from "./human-signoff";

/**
 * The overview — one page a person can read in five seconds.
 *
 * It tells one story: your buying agent negotiating with several suppliers.
 * Pure derivation over the same rooms, cards and sign-offs the board and the
 * dashboard read — no new data and no state of its own, so the overview cannot
 * disagree with the room pages.
 */

/** The procurement story the overview tells; other scenarios live on their own pages. */
export const OVERVIEW_SCENARIO = "commercial-terms";

export interface OverviewRoom {
  room: RoomSummary;
  /** Merged cards for the room, as `mergeResultCards` returns them. */
  cards: ResultCard[];
}

export interface FunnelCounts {
  contacted: number;
  passedCheck: number;
  supplierAccepted: number;
  bothAgreed: number;
  confirmed: number;
}

export type SupplierTone = "you" | "waiting" | "done" | "stopped" | "blocked" | "active";

export interface SupplierView {
  id: string;
  name: string;
  initials: string;
  roomId: string;
  tone: SupplierTone;
  status: string;
  /** Why the room ended where it did, in the agents' own words. */
  summary: string;
  terms: { label: string; value: string }[];
  /** Dropped out of the funnel, and at which step. */
  dropped: "check" | "no-deal" | null;
}

export interface Overview {
  /** The agent present in every room — the person's own buyer. */
  buyer: { id: string; name: string; initials: string } | null;
  funnel: FunnelCounts;
  suppliers: SupplierView[];
  pending: PendingDeal[];
}

export interface PendingDeal {
  room: RoomSummary;
  card: ResultCard;
  supplier: string;
}

/** A room counts as closed once a human has signed off any of its cards. */
function isConfirmed(cards: ResultCard[], signOffs: HumanSignOff[]): boolean {
  return cards.some((card) => findSignOff(signOffs, card) !== undefined);
}

/** How far down the funnel a room got: 0 contacted … 3 both agreed. */
const FUNNEL_REACHED: Record<RoomStatus, number> = {
  "no-match": 0,
  impasse: 1,
  negotiating: 1,
  partial: 2,
  agreed: 3,
};

export function funnelCounts(rooms: OverviewRoom[], signOffs: HumanSignOff[]): FunnelCounts {
  const reached = (stage: number) =>
    rooms.filter(({ room }) => FUNNEL_REACHED[room.status] >= stage).length;
  return {
    contacted: rooms.length,
    passedCheck: reached(1),
    supplierAccepted: reached(2),
    bothAgreed: reached(3),
    confirmed: rooms.filter(({ cards }) => isConfirmed(cards, signOffs)).length,
  };
}

/** `Northwind-Supply-Agent.demo` → `Northwind Supply`. */
export function agentName(id: string): string {
  const base = id.replace(/\.demo$/, "").replace(/-Agent$/, "");
  const words = base.replace(/[-_]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || id;
}

export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

/** The agent that sits in every room — the person's own. Null if there is none. */
function findBuyer(rooms: OverviewRoom[]): string | null {
  if (rooms.length === 0) return null;
  const [first, ...rest] = rooms;
  return (
    first.room.participants.find((p) => rest.every((r) => r.room.participants.includes(p))) ??
    null
  );
}

function supplierStatus(
  supplier: string,
  { room, cards }: OverviewRoom,
  signOffs: HumanSignOff[],
): Pick<SupplierView, "tone" | "status" | "dropped"> {
  if (isConfirmed(cards, signOffs)) return { tone: "done", status: "Deal closed", dropped: null };
  switch (room.status) {
    case "agreed":
      return cards.some((c) => c.agreement === "full" && canConfirm(c, signOffs))
        ? { tone: "you", status: "Deal agreed · waiting for you", dropped: null }
        : { tone: "done", status: "Deal agreed", dropped: null };
    case "partial": {
      const accepted = cards.some((c) => c.status === "agreed" && c.agreed_by.includes(supplier));
      return accepted
        ? { tone: "waiting", status: "Accepted the terms · your agent is deciding", dropped: null }
        : { tone: "active", status: "Considering your agent's offer", dropped: null };
    }
    case "impasse":
      return { tone: "stopped", status: "No deal", dropped: "no-deal" };
    case "no-match":
      return { tone: "blocked", status: "Failed the background check", dropped: "check" };
    default:
      return { tone: "active", status: "Negotiating", dropped: null };
  }
}

const TONE_ORDER: Record<SupplierTone, number> = {
  you: 0,
  waiting: 1,
  active: 2,
  done: 3,
  stopped: 4,
  blocked: 5,
};

/**
 * Everything the overview shows, for the procurement story only. Rooms from
 * other scenarios (the friends' picnic, live demo runs of other kinds) are left
 * to their own pages so the funnel counts one kind of thing.
 */
export function buildOverview(allRooms: OverviewRoom[], signOffs: HumanSignOff[]): Overview {
  const rooms = allRooms.filter(({ room }) => room.scenario === OVERVIEW_SCENARIO);
  const buyerId = findBuyer(rooms);

  const suppliers: SupplierView[] = [];
  const pending: PendingDeal[] = [];
  for (const entry of rooms) {
    const others = entry.room.participants.filter((p) => p !== buyerId);
    const id = others[0] ?? entry.room.participants[0];
    const name = others.map(agentName).join(", ") || agentName(id);
    const card = entry.cards[0];
    suppliers.push({
      id,
      name,
      initials: initials(name),
      roomId: entry.room.room_id,
      summary: entry.room.summary,
      terms: card ? readableTerms(card.terms) : [],
      ...supplierStatus(id, entry, signOffs),
    });
    const waiting = entry.cards.find((c) => c.agreement === "full" && canConfirm(c, signOffs));
    if (waiting) pending.push({ room: entry.room, card: waiting, supplier: name });
  }
  suppliers.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);

  const buyerName = buyerId ? agentName(buyerId) : null;
  return {
    buyer: buyerId && buyerName ? { id: buyerId, name: buyerName, initials: initials(buyerName) } : null,
    funnel: funnelCounts(rooms, signOffs),
    suppliers,
    pending,
  };
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
