import test from "node:test";
import assert from "node:assert/strict";
import { SEED_CARDS } from "../src/lib/seed";
import { mergeResultCards, type ResultCard } from "../src/lib/result-card";
import { cardSignatureVerdict } from "../src/lib/card-signature";
import { demoBuyerCard, supplierCard, supplierLabel } from "../src/lib/agent-card-demo";

/**
 * The seeded board has to hold up to the two claims the product makes about it:
 * every card is signed by the issuer it names, and no card speaks for a party
 * that did not post it. Run with: npm test
 */

const inRoom = (roomId: string) => SEED_CARDS.filter((c) => c.room_id === roomId);

test("every seeded card carries a signature that verifies against the key it names", () => {
  assert.ok(SEED_CARDS.length >= 7, "the board should have a real story on it");
  for (const card of SEED_CARDS) {
    assert.equal(
      cardSignatureVerdict(card),
      "verifies",
      `${card.room_id}: the card signed by ${card.author.slice(0, 12)}… does not verify`,
    );
  }
});

test("a tampered card fails the same check", () => {
  const [card] = SEED_CARDS;
  const tampered: ResultCard = { ...card, terms: { ...card.terms, unit_price: 0.01 } };
  assert.equal(cardSignatureVerdict(tampered), "invalid");
  assert.equal(cardSignatureVerdict({ ...card, sig: "" }), "unsigned");
});

test("a card's author is the key its own agent card carries", () => {
  const supplier = supplierCard("room-northwind");
  const label = supplierLabel("room-northwind");
  const posted = inRoom("room-northwind").find((c) => c.agreed_by.includes(label));
  assert.ok(posted, "the supplier posted a card claiming its own agreement");
  assert.equal(posted.author, supplier.agent_id);

  const buyer = demoBuyerCard();
  const buyerCard = SEED_CARDS.find((c) => c.author === buyer.agent_id);
  assert.ok(buyerCard, "the buyer's own key appears as an author on the board");
});

test("no single card claims agreement on another party's behalf", () => {
  for (const card of SEED_CARDS) {
    assert.ok(
      card.agreed_by.length <= 1,
      `${card.room_id}: one card claims ${card.agreed_by.length} parties — a card may speak only for its author`,
    );
  }
});

test("the agreed room reads full only because both sides posted", () => {
  const raw = inRoom("room-northwind");
  assert.equal(raw.length, 2);
  assert.equal(new Set(raw.map((c) => c.author)).size, 2, "two issuers, two keys");

  const [merged] = mergeResultCards(raw);
  assert.equal(merged.agreement, "full");
  assert.equal(merged.agreed_by.length, 2);
});

test("the multi-party room reads partial 2/3 because two of three posted", () => {
  const raw = inRoom("room-weekend");
  assert.equal(raw.length, 2);
  assert.equal(new Set(raw.map((c) => c.author)).size, 2);

  const [merged] = mergeResultCards(raw);
  assert.equal(merged.status, "agreed");
  assert.equal(merged.agreement, "partial");
  assert.equal(merged.agreed_by.length, 2);
  assert.equal(merged.required_parties.length, 3);
});
