/**
 * Agent A — the buyer-side agent.
 *
 * ============================ NON-PRODUCT ============================
 * This is a DEMONSTRATION CLIENT, not part of the product. It is the same
 * category of thing as the Gemini guide panel on the board: something that
 * exists to *show* the product working from the outside, and that a judge
 * should judge as a demo client rather than as infrastructure.
 *
 * What is product: the MCP gate at `/mcp`, the result-card schema, the
 * canonical form and the signature check. What is this file: one simulated
 * counterparty, its own key, its own strategy and its own printout.
 * =========================================================
 *
 * ## What this process proves
 *
 * Agent Commons is an outcome layer: it keeps no conversation. This process
 * runs on its own, holds its own Ed25519 key, applies its own private pricing
 * strategy, and hands the product exactly one artefact — a signed result card.
 * It never calls anything resembling `send`.
 *
 * The strategy is deliberately different from Agent B's (a different private
 * reservation, a different acceptance rule, a different disclosure policy), and
 * the two strategies are not exchanged. They land on identical terms anyway,
 * because the settlement point sits inside both parties' acceptable sets — so
 * agreement here is *derived* by the product from two signatures over one hash,
 * not announced by either party.
 *
 * The canonicalisation and signing helpers are imported from `src/lib` on
 * purpose: they are the pinned interoperability contract, and a demo that
 * reimplemented them would only be proving it can agree with itself. The key
 * and the strategy below are this process's own and are never shared.
 *
 *   node --import tsx scripts/demo/agent-a.mts
 *
 * Reads DEMO_BASE and DEMO_ROOM from the environment so the orchestrator can
 * point it at a running instance and a free room.
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { generateAgentKeyPair, signValue, withoutSignature } from "../../src/lib/keys";
import { buildResultCard, type ResultCard } from "../../src/lib/result-card";

const base = (process.env.DEMO_BASE ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const roomId = process.env.DEMO_ROOM ?? "room-two-owner-demo";

/**
 * The request for quotation, as published to the invited parties. Both agents
 * receive these same figures — that is the only thing they have in common, and
 * it is not a channel: it is a document, not a message.
 *
 * The orchestrator normally supplies a run-scoped RFQ in `DEMO_RFQ` so repeated
 * runs do not collide. The defaults below keep this file runnable on its own.
 *
 * These figures are deliberately NOT the seeded rooms' figures. If this demo
 * reused them, `verify_terms` would match a seeded card as well and the one
 * hash in the room could be mistaken for something the seed already agreed.
 * This room's hash has to be attributable to these two agents alone.
 */
const RFQ = {
  spec: process.env.DEMO_RFQ ?? "PX-900",
  quantity: 12000,
  /** The price the RFQ names as acceptable. */
  anchor_unit_price: 7.35,
  lead_time_days: 28,
} as const;

/**
 * Party labels for the roster, from the RFQ's invitation list. Labels — not keys
 * — because a roster has to be knowable by both sides *before* either has
 * posted anything; keys are minted per process at run time. Authorship is a
 * different matter and is cryptographic: see `author` below.
 */
const BUYER = "Kestrel-Buyer-Agent.p10demo";
const SUPPLIER = "Harbour-Supply-Agent.p10demo";

/**
 * Agent A's private configuration. Never leaves this process, and in
 * particular never reaches Agent B — that is the whole point of the exercise.
 */
const MAX_UNIT_PRICE = 7.6;
const STRATEGY_NAME = "accept the anchor when it clears a private ceiling";
const DISCLOSURE_POLICY = {
  may_disclose: ["spec", "quantity", "unit_price", "lead_time_days"],
  must_not_disclose: ["max_unit_price", "annual_budget"],
};

/**
 * Agent A's strategy: accept the RFQ's anchor when it clears this agent's own
 * ceiling, otherwise hold. Deliberately *not* Agent B's rule — the two agents
 * agree on the outcome while disagreeing on the method.
 */
function settle(): { terms: Record<string, unknown>; accepted: boolean; why: string } {
  const price = Number(RFQ.anchor_unit_price.toFixed(2));
  const accepted = price <= MAX_UNIT_PRICE;
  const why = accepted
    ? `anchor ${price.toFixed(2)} is at or below this agent's private ceiling`
    : `anchor ${price.toFixed(2)} exceeds this agent's private ceiling`;
  // Only fields this agent's own policy permits may appear in the terms.
  const candidate: Record<string, unknown> = {
    spec: RFQ.spec,
    quantity: RFQ.quantity,
    unit_price: price,
    lead_time_days: RFQ.lead_time_days,
  };
  const terms: Record<string, unknown> = {};
  for (const key of Object.keys(candidate)) {
    if (DISCLOSURE_POLICY.must_not_disclose.includes(key)) continue;
    if (!DISCLOSURE_POLICY.may_disclose.includes(key)) continue;
    terms[key] = candidate[key];
  }
  return { terms, accepted, why };
}

function say(label: string, value: unknown) {
  console.log(`  ${label.padEnd(22)} ${String(value)}`);
}

async function main() {
  const decision = settle();

  console.log(`\n=== Agent A — buyer side (NON-PRODUCT demo client) ===`);
  console.log(`  room                ${roomId}`);
  console.log(`  gate                ${base}/mcp`);
  say("private ceiling", `${MAX_UNIT_PRICE.toFixed(2)} (never disclosed)`);
  say("strategy", STRATEGY_NAME);
  say("decision", `${decision.accepted ? "accept" : "hold"} — ${decision.why}`);
  say("terms it will post", JSON.stringify(decision.terms));

  if (!decision.accepted) {
    // A held position is a first-class outcome, so this agent would post an
    // impasse card rather than nothing. It does not apply to these figures;
    // the branch is here so the strategy is not a rubber stamp.
    throw new Error("Agent A's strategy rejected the terms — refusing to post an agreed card");
  }

  // This process's own identity. Minted here, used here, never written to disk
  // and never shared with Agent B.
  const keys = generateAgentKeyPair();

  const unsigned = buildResultCard({
    room_id: roomId,
    scenario: "commercial-terms",
    status: "agreed",
    summary: `Buyer accepts ${RFQ.spec} x${RFQ.quantity} at ${RFQ.anchor_unit_price}/unit, ${RFQ.lead_time_days}-day lead.`,
    terms: decision.terms,
    participants: [BUYER, SUPPLIER],
    required_parties: [BUYER, SUPPLIER],
    // Only this agent's own agreement. Agent A does not get to speak for the
    // supplier, and the orchestrator asserts exactly this.
    agreed_by: [BUYER],
    next_step: "awaiting_signature",
    author: keys.publicKeyRaw,
  });
  const card: ResultCard = {
    ...unsigned,
    sig: signValue(withoutSignature(unsigned), keys.privateKey),
  };

  console.log(`\n  --- the card this agent signs ---`);
  say("author (own key)", `${keys.publicKeyRaw.slice(0, 16)}…`);
  say("hash (computed here)", card.hash);
  say("required_parties", card.required_parties.join(", "));
  say("agreed_by (self only)", card.agreed_by.join(", "));
  say("agreement on its own", card.agreement);

  const client = new Client({ name: "p10-demo-agent-a", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));

  const posted = await client.callTool({ name: "post_result_card", arguments: { card } });
  const text = (posted.content as Array<{ type: string; text: string }>)
    .map((c) => c.text)
    .join("\n");

  console.log(`\n  --- the gate's answer ---`);
  say("isError", String(posted.isError === true));
  console.log(
    text
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n"),
  );
  if (posted.isError === true) throw new Error(`the gate refused Agent A's card:\n${text}`);

  // Read the card back through the gate and check it is the one that landed.
  const readBack = await client.callTool({
    name: "read_result_cards",
    arguments: { room_id: roomId },
  });
  const cards = JSON.parse(
    (readBack.content as Array<{ type: string; text: string }>).map((c) => c.text).join("\n"),
  ).cards as ResultCard[];
  const mine = cards.find((c) => c.author === keys.publicKeyRaw);

  console.log(`\n  --- self-check ---`);
  say("cards in room", String(cards.length));
  say("my card is there", String(mine !== undefined));
  say("hash unchanged", String(mine?.hash === card.hash));
  say("I claimed only me", String(mine?.agreed_by.length === 1 && mine.agreed_by[0] === BUYER));

  await client.close();

  if (!mine || mine.hash !== card.hash) throw new Error("Agent A could not read its own card back");
  console.log(`\n  Agent A done. It never called anything but the four outcome tools.`);
}

await main();
