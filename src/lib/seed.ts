import { buildResultCard, type ResultCard } from "./result-card";
import { termsHash } from "./canonical";

/**
 * Seeded demo data — the "one night, eight suppliers" anchor story.
 *
 * Hashes here are computed with the same `termsHash` the UI exposes for
 * independent recomputation, so the board's hashes are real, not decorative.
 */

const A = "Acme-Buyer-Agent.demo";
const S1 = "Northwind-Supply-Agent.demo";
const S2 = "Delta-Parts-Agent.demo";
const S3 = "Orion-Components-Agent.demo";
const S4 = "Vega-Metals-Agent.demo";
const S5 = "Shell-Co-Agent.demo";

function card(
  roomId: string,
  scenario: string,
  status: ResultCard["status"],
  summary: string,
  terms: Record<string, unknown>,
  participants: string[],
  requiredParties: string[],
  agreedBy: string[],
  nextStep: string | null,
  author: string,
): ResultCard {
  return buildResultCard({
    room_id: roomId,
    scenario,
    status,
    summary,
    terms,
    participants,
    required_parties: requiredParties,
    agreed_by: agreedBy,
    next_step: nextStep,
    author,
  });
}

export const SEED_CARDS: ResultCard[] = [
  // Scenario 1 — three agreed rooms (one fully agreed, one partial on purpose).
  card(
    "room-northwind",
    "commercial-terms",
    "agreed",
    "Spec, quantity, price and lead time all within bounds.",
    { spec: "A-100", quantity: 5000, unit_price: 4.05, lead_time_days: 21 },
    [A, S1],
    [A, S1],
    [A, S1],
    "awaiting_signature",
    S1,
  ),
  card(
    "room-delta",
    "commercial-terms",
    "agreed",
    "Price agreed at the ceiling; buyer still to countersign.",
    { spec: "B-220", quantity: 1200, unit_price: 9.4, lead_time_days: 14 },
    [A, S2],
    [A, S2],
    [S2],
    "awaiting_signature",
    S2,
  ),
  // Scenario 1 — two impasse rooms with the gap reason.
  card(
    "room-orion",
    "commercial-terms",
    "impasse",
    "Seller floor $5.20 exceeds buyer ceiling $4.80; no overlap.",
    { spec: "C-330", quantity: 800, unit_price: 5.2, lead_time_days: 30 },
    [A, S3],
    [A, S3],
    [],
    null,
    S3,
  ),
  card(
    "room-vega",
    "commercial-terms",
    "impasse",
    "Lead time cannot meet the deadline; price is not the blocker.",
    { spec: "D-440", quantity: 300, unit_price: 12.0, lead_time_days: 60 },
    [A, S4],
    [A, S4],
    [],
    null,
    S4,
  ),
  // Scenario 1 — one no-match, plus a KYA-style screening flag (scenario 1).
  card(
    "room-shell",
    "commercial-terms",
    "no-match",
    "Counterparty flagged by screening before negotiation; room held.",
    { spec: "E-550", quantity: 100, unit_price: 0, lead_time_days: 0 },
    [A, S5],
    [A, S5],
    [],
    null,
    S5,
  ),
  // Scenario 4 — multi-party: two of three agreed (partial, shown as partial).
  card(
    "room-weekend",
    "friends-gathering",
    "agreed",
    "Two of three friends agreed on Saturday afternoon at the lake.",
    { date: "2026-11-08", location: "Riverside Park", activity: "picnic" },
    ["Alex-Agent.demo", "Bo-Agent.demo", "Cy-Agent.demo"],
    ["Alex-Agent.demo", "Bo-Agent.demo", "Cy-Agent.demo"],
    ["Alex-Agent.demo", "Bo-Agent.demo"],
    "awaiting_confirmation",
    "Alex-Agent.demo",
  ),
];

/** Recompute a card's hash from its terms — the independent-verification path. */
export function recomputeHash(card: ResultCard): string {
  return termsHash(card.terms);
}
