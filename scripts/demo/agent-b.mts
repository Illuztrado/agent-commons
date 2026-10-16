/**
 * Agent B — the supplier-side agent.
 *
 * ============================ NON-PRODUCT ============================
 * A DEMONSTRATION CLIENT, not part of the product — the same category as the
 * Gemini guide panel on the board: it exists to show the product working from
 * the outside, and it should be judged as a demo client, not as
 * infrastructure.
 *
 * What is product: the MCP gate at `/mcp`, the result-card schema, the
 * canonical form, the signature check. What is this file: the second simulated
 * counterparty, with its own key and its own strategy.
 * =========================================================
 *
 * ## What this process proves
 *
 * A *different owner* reaches agreement without either agent ever seeing the
 * other's strategy, key or card-before-posting. This process mints its own
 * Ed25519 key, applies its own rule to its own private floor, and posts one
 * signed card.
 *
 * The strategy is intentionally not Agent A's rule. Agent A accepts an anchor
 * that clears a private *ceiling*; this agent accepts one that clears a private
 * *floor*. Different reasoning, same outcome — and because the outcome is the
 * same, both cards carry the same terms hash. The product then derives full
 * agreement from that coincidence of hashes, verified against two different
 * issuer keys.
 *
 * There is no message channel anywhere in this file. Agent B does not read
 * Agent A's card, and does not need to: it already knows what it agrees to.
 * Reading the room afterwards is a read of *results*, which is the one thing
 * this product does keep.
 *
 *   node --import tsx scripts/demo/agent-b.mts
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { generateAgentKeyPair, signValue, withoutSignature } from "../../src/lib/keys";
import { buildResultCard, type ResultCard } from "../../src/lib/result-card";

const base = (process.env.DEMO_BASE ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const roomId = process.env.DEMO_ROOM ?? "room-two-owner-demo";

/**
 * The request for quotation, as published to the invited parties. The same
 * document Agent A saw. It is a document, not a channel — nothing in it is a
 * message from the other agent.
 *
 * `DEMO_RFQ` is the run-scoped spec the orchestrator supplies so repeated runs
 * do not collide; the default keeps this file runnable on its own. These
 * figures are deliberately not the seeded rooms' figures, so the one hash in
 * the demo room is attributable to the two agents alone.
 */
const RFQ = {
  spec: process.env.DEMO_RFQ ?? "PX-900",
  quantity: 12000,
  anchor_unit_price: 7.35,
  lead_time_days: 28,
} as const;

/** The roster from the RFQ's invitation list. Knowable by both, before either posts. */
const BUYER = "Kestrel-Buyer-Agent.p10demo";
const SUPPLIER = "Harbour-Supply-Agent.p10demo";

/** This agent's private configuration. Never leaves this process. */
const MIN_UNIT_PRICE = 7.1;
const STRATEGY_NAME = "accept the anchor when it clears a private floor";
const DISCLOSURE_POLICY = {
  may_disclose: ["spec", "quantity", "unit_price", "lead_time_days"],
  must_not_disclose: ["min_unit_price", "unit_cost"],
};

/**
 * This agent's strategy, which is *not* Agent A's: accept the anchor when it
 * clears this agent's own floor. A floor rule and a ceiling rule can reach the
 * same price without either side knowing the other's number.
 */
function settle(): { terms: Record<string, unknown>; accepted: boolean; why: string } {
  const price = Number(RFQ.anchor_unit_price.toFixed(2));
  const accepted = price >= MIN_UNIT_PRICE;
  const why = accepted
    ? `anchor ${price.toFixed(2)} is at or above this agent's private floor`
    : `anchor ${price.toFixed(2)} is below this agent's private floor`;
  const candidate: Record<string, unknown> = {
    spec: RFQ.spec,
    quantity: RFQ.quantity,
    unit_price: price,
    lead_time_days: RFQ.lead_time_days,
  };
  // Enforce this agent's own disclosure policy on the way out.
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

  console.log(`\n=== Agent B — supplier side (NON-PRODUCT demo client) ===`);
  console.log(`  room                ${roomId}`);
  console.log(`  gate                ${base}/mcp`);
  say("private floor", `${MIN_UNIT_PRICE.toFixed(2)} (never disclosed)`);
  say("strategy", STRATEGY_NAME);
  say("decision", `${decision.accepted ? "accept" : "hold"} — ${decision.why}`);
  say("terms it will post", JSON.stringify(decision.terms));

  if (!decision.accepted) {
    throw new Error("Agent B's strategy rejected the terms — refusing to post an agreed card");
  }

  // This process's own identity: a different key from Agent A's, by
  // construction, because it is generated here and never shared.
  const keys = generateAgentKeyPair();

  const unsigned = buildResultCard({
    room_id: roomId,
    scenario: "commercial-terms",
    status: "agreed",
    summary: `Supplier confirms ${RFQ.spec} x${RFQ.quantity} at ${RFQ.anchor_unit_price}/unit, ${RFQ.lead_time_days}-day lead.`,
    terms: decision.terms,
    participants: [BUYER, SUPPLIER],
    required_parties: [BUYER, SUPPLIER],
    // Only this agent's own agreement. Each party speaks for itself; the
    // product merges the two into "agreed".
    agreed_by: [SUPPLIER],
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

  const client = new Client({ name: "p10-demo-agent-b", version: "0.1.0" });
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
  if (posted.isError === true) throw new Error(`the gate refused Agent B's card:\n${text}`);

  // Read the room back. This is a read of *results* — the one thing this
  // product keeps. There is no conversation here to read, because there is no
  // conversation here at all.
  const readBack = await client.callTool({
    name: "read_result_cards",
    arguments: { room_id: roomId },
  });
  const cards = JSON.parse(
    (readBack.content as Array<{ type: string; text: string }>).map((c) => c.text).join("\n"),
  ).cards as ResultCard[];

  console.log(`\n  --- what the room holds now ---`);
  say("cards in room", String(cards.length));
  say("distinct issuers", String(new Set(cards.map((c) => c.author)).size));
  say("distinct hashes", String(new Set(cards.map((c) => c.hash)).size));
  for (const c of cards) {
    say(`  ${c.author.slice(0, 12)}…`, `agreed_by=[${c.agreed_by.join(", ")}] hash=${c.hash.slice(0, 20)}…`);
  }

  // Recompute the hash from terms alone, through the gate — the check that
  // needs no trust in this server.
  const verified = await client.callTool({
    name: "verify_terms",
    arguments: { terms: decision.terms },
  });
  const vText = (verified.content as Array<{ type: string; text: string }>)
    .map((c) => c.text)
    .join("\n");
  const recomputed = JSON.parse(vText).hash as string;
  console.log(`\n  --- independent recomputation ---`);
  say("my hash", card.hash);
  say("gate recomputes", recomputed);
  say("they match", String(recomputed === card.hash));
  say("cards on that hash", String(JSON.parse(vText).matches.length));

  await client.close();

  if (recomputed !== card.hash) throw new Error("Agent B's terms did not recompute to its own hash");
  if (new Set(cards.map((c) => c.hash)).size !== 1) {
    throw new Error("the two agents did NOT land on the same terms hash");
  }
  console.log(`\n  Agent B done. Two owners, two keys, one terms hash.`);
}

await main();
