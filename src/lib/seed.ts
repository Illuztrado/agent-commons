import { buildResultCard, type ResultCard } from "./result-card";
import { termsHash } from "./canonical";
import { withoutSignature } from "./keys";
import {
  BUYER_AGENT_ID,
  BUYER_LABEL,
  mintIssuer,
  signAsAgent,
  supplierAgentId,
  supplierLabel,
} from "./agent-card-demo";

/**
 * Seeded demo data — one retailer's sourcing round, plus one room that is not
 * about commerce at all.
 *
 * Two things this file is careful about.
 *
 * 1. **Every card carries a real signature.** A card's `author` is the issuer's
 *    Ed25519 public key — the same key that appears as `agent_id` on that
 *    agent's card — and `sig` is that key's signature over the card without its
 *    `sig` field. So the key directory at `/.well-known/agent-commons-keys`
 *    lists every issuer on this board, and "Proof for auditors" on a deal page
 *    can check a signature instead of only recomputing a hash.
 *
 * 2. **No card speaks for a party that did not post it.** Where two sides
 *    agreed, there are two cards over one terms hash, each claiming only its own
 *    author's agreement; the room reads `agreed` because the product unions the
 *    two — not because one side wrote down both. The multi-party room works the
 *    same way: two of three posted, so it reads partial 2/3.
 *
 * Hashes are computed with the same `termsHash` the UI exposes for independent
 * recomputation, so the board's hashes are real, not decorative.
 */

/* ------------------------------------------------------------------ *
 * Issuers
 * ------------------------------------------------------------------ */

interface Issuer {
  agent_id: string;
  sign: (value: unknown) => string;
}

/** An issuer that signs with its own seeded private key, held in agent-card-demo. */
const issuerOf = (agentId: string): Issuer => ({
  agent_id: agentId,
  sign: (value) => signAsAgent(agentId, value),
});

const BUYER_ISSUER = issuerOf(BUYER_AGENT_ID);
const NORTHWIND_ISSUER = issuerOf(supplierAgentId("room-northwind"));
const DELTA_ISSUER = issuerOf(supplierAgentId("room-delta"));
const ORION_ISSUER = issuerOf(supplierAgentId("room-orion"));
const VEGA_ISSUER = issuerOf(supplierAgentId("room-vega"));
const SHELL_ISSUER = issuerOf(supplierAgentId("room-shell"));

/* ------------------------------------------------------------------ *
 * Roster labels — knowable in advance, unlike a key minted at run time
 * ------------------------------------------------------------------ */

const BUYER = BUYER_LABEL;
const NORTHWIND = supplierLabel("room-northwind");
const DELTA = supplierLabel("room-delta");
const ORION = supplierLabel("room-orion");
const VEGA = supplierLabel("room-vega");
const SHELL = supplierLabel("room-shell");

/* ------------------------------------------------------------------ *
 * Card construction
 * ------------------------------------------------------------------ */

interface PostInput {
  room_id: string;
  status: ResultCard["status"];
  summary: string;
  terms: Record<string, unknown>;
  participants: string[];
  required_parties: string[];
  /** Only the parties that actually posted a card claiming agreement. */
  agreed_by: string[];
  next_step: string | null;
  /** The posting party: its key becomes the card's `author` and signs it. */
  issuer: Issuer;
}

/** Build a card and sign it with its issuer's key — the way a real issuer does. */
function post(input: PostInput): ResultCard {
  const unsigned = buildResultCard({
    room_id: input.room_id,
    scenario: "commercial-terms",
    status: input.status,
    summary: input.summary,
    terms: input.terms,
    participants: input.participants,
    required_parties: input.required_parties,
    agreed_by: input.agreed_by,
    next_step: input.next_step,
    author: input.issuer.agent_id,
  });
  return { ...unsigned, sig: input.issuer.sign(withoutSignature(unsigned)) };
}

/* ------------------------------------------------------------------ *
 * One sourcing round for a mid-size homeware retailer, ahead of a spring
 * launch. Five suppliers, five different outcomes, real figures.
 * ------------------------------------------------------------------ */

/** Northwind: the deal that is waiting for the human. */
const NORTHWIND_TERMS = {
  spec: "HBR-VAC-750",
  quantity: 12000,
  unit_price: 3.85,
  incoterms: "FOB Haiphong",
  payment_terms: "30% deposit, 70% on B/L",
  lead_time_days: 45,
};

export const SEED_CARDS: ResultCard[] = [
  /* ---- room-northwind: two cards, one hash ----------------------------
   * The supplier posted, the buyer posted, and the room reads `agreed`
   * because the product unions what the two of them signed. The
   * counterparty's agent card has expired, which is why the overview warns
   * before offering the confirm button.
   */
  post({
    room_id: "room-northwind",
    status: "agreed",
    summary: "Insulated flask HBR-VAC-750 agreed at $3.85/unit, 45-day lead, FOB Haiphong.",
    terms: NORTHWIND_TERMS,
    participants: [BUYER, NORTHWIND],
    required_parties: [BUYER, NORTHWIND],
    agreed_by: [NORTHWIND],
    next_step: "awaiting_signature",
    issuer: NORTHWIND_ISSUER,
  }),
  post({
    room_id: "room-northwind",
    status: "agreed",
    summary: "Buyer accepts HBR-VAC-750 x12,000 at $3.85/unit, 45-day lead, FOB Haiphong.",
    terms: NORTHWIND_TERMS,
    participants: [BUYER, NORTHWIND],
    required_parties: [BUYER, NORTHWIND],
    agreed_by: [BUYER],
    next_step: "awaiting_signature",
    issuer: BUYER_ISSUER,
  }),

  /* ---- room-delta: the supplier is in, the buyer is not yet ----------- */
  post({
    room_id: "room-delta",
    status: "agreed",
    summary: "Supplier accepts HBR-KNF-8IN at $6.20/unit; the buyer has not countersigned.",
    terms: {
      spec: "HBR-KNF-8IN",
      quantity: 4000,
      unit_price: 6.2,
      incoterms: "FOB Gdansk",
      payment_terms: "Net 45",
      lead_time_days: 35,
    },
    participants: [BUYER, DELTA],
    required_parties: [BUYER, DELTA],
    agreed_by: [DELTA],
    next_step: "awaiting_signature",
    issuer: DELTA_ISSUER,
  }),

  /* ---- room-orion: a clean impasse on price --------------------------- */
  post({
    room_id: "room-orion",
    status: "impasse",
    summary: "Seller floor $3.40 exceeds buyer ceiling $2.95 on HBR-GLS-6PC; no overlap.",
    terms: {
      spec: "HBR-GLS-6PC",
      quantity: 6000,
      unit_price: 2.95,
      incoterms: "FOB Izmir",
      payment_terms: "30% deposit, 70% on B/L",
      lead_time_days: 40,
    },
    participants: [BUYER, ORION],
    required_parties: [BUYER, ORION],
    agreed_by: [],
    next_step: null,
    issuer: ORION_ISSUER,
  }),

  /* ---- room-vega: an impasse where price is not the blocker ----------- */
  post({
    room_id: "room-vega",
    status: "impasse",
    summary: "75-day lead on HBR-CUT-24PC misses the launch window; price is not the blocker.",
    terms: {
      spec: "HBR-CUT-24PC",
      quantity: 2500,
      unit_price: 8.75,
      incoterms: "FOB Chennai",
      payment_terms: "Net 30",
      lead_time_days: 75,
    },
    participants: [BUYER, VEGA],
    required_parties: [BUYER, VEGA],
    agreed_by: [],
    next_step: null,
    issuer: VEGA_ISSUER,
  }),

  /* ---- room-shell: stopped by screening before any offer --------------
   * No price was ever agreed, so this room contributes no order value to the
   * funnel — the honest reading of a room that never reached terms.
   */
  post({
    room_id: "room-shell",
    status: "no-match",
    summary: "Counterparty flagged by the screening check before negotiation; the room is held.",
    terms: { spec: "HBR-MUG-350", quantity: 15000 },
    participants: [BUYER, SHELL],
    required_parties: [BUYER, SHELL],
    agreed_by: [],
    next_step: null,
    issuer: SHELL_ISSUER,
  }),

  ...friendsGathering(),
];

/**
 * room-weekend — three friends, two of them in.
 *
 * Not commerce, and deliberately so: the same product carries a multi-party
 * room. Two cards, two issuers, one hash, so it reads partial 2/3 because two
 * of three posted — not because one friend wrote down another's vote.
 */
function friendsGathering(): ResultCard[] {
  const ALEX = "Alex-Agent.demo";
  const BO = "Bo-Agent.demo";
  const CY = "Cy-Agent.demo";
  const terms = { date: "2026-11-08", location: "Riverside Park", activity: "picnic" };
  const posters: Array<[string, ReturnType<typeof mintIssuer>, string]> = [
    [ALEX, mintIssuer(), "Alex is in for Saturday afternoon at the lake."],
    [BO, mintIssuer(), "Bo is in for Saturday afternoon at the lake."],
  ];
  return posters.map(([label, issuer, summary]) => {
    const unsigned = buildResultCard({
      room_id: "room-weekend",
      scenario: "friends-gathering",
      status: "agreed",
      summary,
      terms,
      participants: [ALEX, BO, CY],
      required_parties: [ALEX, BO, CY],
      agreed_by: [label],
      next_step: "awaiting_confirmation",
      author: issuer.agent_id,
    });
    return { ...unsigned, sig: issuer.sign(withoutSignature(unsigned)) };
  });
}

/** Recompute a card's hash from its terms — the independent-verification path. */
export function recomputeHash(card: ResultCard): string {
  return termsHash(card.terms);
}
