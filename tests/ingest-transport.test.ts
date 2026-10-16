import test from "node:test";
import assert from "node:assert/strict";
import { buildResultCard, type ResultCard } from "../src/lib/result-card";
import { generateAgentKeyPair, signValue, withoutSignature } from "../src/lib/keys";
import { getIngestTransport, listRoomsWithPosted } from "../src/lib/ingest-transport";

/**
 * The write layer an external agent reaches, and the room list the board reads.
 * Run with: npm test
 *
 * Worth pinning, because the room list is *derived* from posted cards and that
 * derivation had a bug: posted cards were merged across every room before the
 * rooms were grouped, so two rooms that agreed over the same terms hash
 * collapsed into a single row. The second room stayed readable through
 * `read_result_cards` but never appeared on the board — the one thing the board
 * is for. Merging belongs inside a room, and these tests hold it there.
 */

/** One terms object, so two rooms can genuinely share a hash. */
const TERMS = { spec: "A-100", quantity: 5000, unit_price: 4.05, lead_time_days: 21 };
const PARTIES = ["Buyer.demo", "Seller.demo"];

/** A card as an external issuer would post it: its own key, the room's parties. */
function signedCard(roomId: string, agreedBy: string[]): ResultCard {
  const keys = generateAgentKeyPair();
  const unsigned = buildResultCard({
    room_id: roomId,
    scenario: "commercial-terms",
    status: "agreed",
    summary: "All commercial terms inside both parties' bounds.",
    terms: TERMS,
    participants: PARTIES,
    required_parties: PARTIES,
    agreed_by: agreedBy,
    next_step: "awaiting_signature",
    author: keys.publicKeyRaw,
  });
  return { ...unsigned, sig: signValue(withoutSignature(unsigned), keys.privateKey) };
}

test("two rooms over the same terms hash both stay on the board", async () => {
  const ingest = getIngestTransport();
  const first = signedCard("room-shared-terms-a", [PARTIES[0]]);
  const second = signedCard("room-shared-terms-b", [PARTIES[0]]);
  assert.equal(
    first.hash,
    second.hash,
    "the two cards must share a hash for this test to mean anything",
  );

  await ingest.putResultCard(first.room_id, first);
  await ingest.putResultCard(second.room_id, second);

  const ids = (await listRoomsWithPosted()).map((room) => room.room_id);
  assert.ok(ids.includes("room-shared-terms-a"), `first room missing from ${ids.join(", ")}`);
  assert.ok(ids.includes("room-shared-terms-b"), `second room missing from ${ids.join(", ")}`);
});

test("two issuers over one hash roll their own room up to agreed", async () => {
  const ingest = getIngestTransport();
  await ingest.putResultCard("room-rollup", signedCard("room-rollup", [PARTIES[0]]));
  await ingest.putResultCard("room-rollup", signedCard("room-rollup", [PARTIES[1]]));

  const room = (await listRoomsWithPosted()).find((r) => r.room_id === "room-rollup");
  assert.ok(room, "the posted room must be listed");
  assert.equal(room.status, "agreed");
  assert.equal(room.agreed_parties, 2);
  assert.equal(room.required_parties, 2);
});

test("one issuer alone leaves the room partial, never agreed", async () => {
  const ingest = getIngestTransport();
  await ingest.putResultCard("room-partial", signedCard("room-partial", [PARTIES[0]]));

  const room = (await listRoomsWithPosted()).find((r) => r.room_id === "room-partial");
  assert.ok(room, "the posted room must be listed");
  assert.equal(room.status, "partial");
  assert.equal(room.agreed_parties, 1);
});

test("re-posting the same card replaces its row instead of adding one", async () => {
  const ingest = getIngestTransport();
  const card = signedCard("room-idempotent", [PARTIES[0]]);
  await ingest.putResultCard(card.room_id, card);
  await ingest.putResultCard(card.room_id, card);

  const mine = (await ingest.listResultCards(card.room_id)).filter(
    (c) => c.author === card.author && c.hash === card.hash,
  );
  assert.equal(mine.length, 1);
});

test("a card whose room_id disagrees with the room it is posted to is refused", async () => {
  const ingest = getIngestTransport();
  const card = signedCard("room-elsewhere", [PARTIES[0]]);
  await assert.rejects(() => ingest.putResultCard("room-wrong", card), /does not match the room/);
});
