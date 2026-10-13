import { buildResultCard, type ResultCard } from "./result-card";

/**
 * Autonomous negotiation loop.
 *
 * Two agents, one per side, negotiate without any intermediate human gate.
 * Bounded by a max-round limit; each round validates the counterparty's
 * constraints and enforces the *own* owner's disclosure policy. Terminates in
 * `agreed` or `impasse` — both are first-class results.
 *
 * Deterministic by default (no API key needed). A Gemini-backed variant can
 * propose the same shape, but the constraint validation below is the source of
 * truth either way.
 */

export interface PartyPolicy {
  may_disclose: string[];
  must_not_disclose: string[];
}

export interface Party {
  id: string;
  display_name: string;
  role: "buyer" | "seller";
  /** Buyer: maximum acceptable price. Seller: minimum acceptable price. */
  reservation: number;
  policy: PartyPolicy;
}

export interface Round {
  round: number;
  from: string;
  role: Party["role"];
  price: number;
  fields: Record<string, unknown>;
}

export interface NegotiationOutcome {
  status: "agreed" | "impasse";
  rounds: Round[];
  price: number | null;
  /** Fields that should never have been disclosed — must stay empty. */
  leaked: string[];
  gap: string | null;
}

export interface NegotiationInput {
  buyer: Party;
  seller: Party;
  maxRounds?: number;
  baseFields?: Record<string, unknown>;
}

const CONCESSION = 0.35;

function emitFields(
  party: Party,
  base: Record<string, unknown>,
  price: number,
): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...base, unit_price: Number(price.toFixed(2)) };
  const leaked: string[] = [];
  for (const key of Object.keys(fields)) {
    if (party.policy.must_not_disclose.includes(key)) {
      delete fields[key];
      leaked.push(key);
    }
  }
  return fields;
}

/** Check which (if any) forbidden fields a party tried to put on the wire. */
function checkLeak(party: Party, fields: Record<string, unknown>): string[] {
  return Object.keys(fields).filter((k) => party.policy.must_not_disclose.includes(k));
}

export function runNegotiation(input: NegotiationInput): NegotiationOutcome {
  const { buyer, seller } = input;
  const maxRounds = input.maxRounds ?? 6;
  const base = input.baseFields ?? {};

  let b = Number((buyer.reservation * 0.85).toFixed(2));
  let s = Number((seller.reservation * 1.25).toFixed(2));

  const rounds: Round[] = [];
  const leaked: string[] = [];

  for (let round = 1; round <= maxRounds; round += 1) {
    const buyerFields = emitFields(buyer, base, b);
    const sellerFields = emitFields(seller, base, s);
    leaked.push(...checkLeak(buyer, buyerFields), ...checkLeak(seller, sellerFields));

    rounds.push({ round, from: buyer.id, role: "buyer", price: b, fields: buyerFields });
    rounds.push({ round, from: seller.id, role: "seller", price: s, fields: sellerFields });

    if (b >= s) {
      const price = Number(((b + s) / 2).toFixed(2));
      return { status: "agreed", rounds, price, leaked, gap: null };
    }

    b = Number((b + (buyer.reservation - b) * CONCESSION).toFixed(2));
    s = Number((s - (s - seller.reservation) * CONCESSION).toFixed(2));
  }

  return {
    status: "impasse",
    rounds,
    price: null,
    leaked,
    gap: `buyer ceiling ${buyer.reservation} below seller floor ${seller.reservation}`,
  };
}

export interface NegotiationRoomInput {
  room_id: string;
  scenario: string;
  buyer: Party;
  seller: Party;
  maxRounds?: number;
  baseFields?: Record<string, unknown>;
}

/** Run a negotiation and turn the outcome into a signed result card. */
export function negotiateToResultCard(
  input: NegotiationRoomInput,
  sign: (value: unknown) => string,
): { card: ResultCard; outcome: NegotiationOutcome } {
  const outcome = runNegotiation({
    buyer: input.buyer,
    seller: input.seller,
    maxRounds: input.maxRounds,
    baseFields: input.baseFields,
  });

  const participants = [input.buyer.id, input.seller.id];
  const required = [...participants];

  const terms =
    outcome.status === "agreed"
      ? { ...input.baseFields, unit_price: outcome.price }
      : { ...input.baseFields, gap: outcome.gap };

  const card = buildResultCard({
    room_id: input.room_id,
    scenario: input.scenario,
    status: outcome.status,
    summary:
      outcome.status === "agreed"
        ? `Converged at ${outcome.price} after ${outcome.rounds.length / 2} rounds.`
        : `Impasse: ${outcome.gap}.`,
    terms,
    participants,
    required_parties: required,
    agreed_by: outcome.status === "agreed" ? required : [],
    next_step: outcome.status === "agreed" ? "awaiting_signature" : null,
    author: input.seller.id,
  });

  // Sign over the card without its `sig` field.
  const { sig: _sig, ...payload } = card;
  return { card: { ...card, sig: sign(payload) }, outcome };
}
