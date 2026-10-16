import test from "node:test";
import assert from "node:assert/strict";
import { buildResultCard, mergeResultCards } from "../src/lib/result-card";
import { termsHash } from "../src/lib/canonical";
import { generateAgentKeyPair, signValue, verifyValue, withoutSignature } from "../src/lib/keys";
import { SEED_CARDS } from "../src/lib/seed";
import { RESULT_CARD_VC_TYPE, VC2_CONTEXT, resultCardToVc2Shape } from "../src/lib/vc-export";

/**
 * The VC 2.0-shaped export — shape only, never a conformance claim.
 * Run with: npm test
 *
 * These lock the invariants docs/vc-2.0-mapping.md states, so the doc cannot
 * drift from the code:
 *   1. the envelope shape (base context, VerifiableCredential, issuer,
 *      credentialSubject, sig — exactly five top-level keys);
 *   2. credentialSubject is the card as signed: the author's own Ed25519
 *      signature verifies against the export under the pinned canonical rule;
 *   3. the export changes no semantics: terms hash recomputes identically;
 *   4. no VC securing mechanism is claimed (no proof / credentialStatus /
 *      evidence / validFrom / credentialSchema anywhere in the envelope);
 *   5. the merged multi-card caveat: the head card's signature verifies only
 *      while agreed_by is still the head card's own.
 */

function signedCard(overrides: Partial<Parameters<typeof buildResultCard>[0]> = {}) {
  const keys = generateAgentKeyPair();
  const card = buildResultCard({
    room_id: "room-vc-test",
    scenario: "commercial-terms",
    status: "agreed",
    summary: "Signed in test, exported VC 2.0-shaped.",
    terms: { spec: "A-100", quantity: 5000, unit_price: 4.05, lead_time_days: 21 },
    participants: ["buyer.demo", "seller.demo"],
    required_parties: ["buyer.demo", "seller.demo"],
    agreed_by: ["buyer.demo", "seller.demo"],
    next_step: null,
    author: keys.publicKeyRaw,
    ...overrides,
  });
  const { sig: _s, ...payload } = card;
  return { card: { ...card, sig: signValue(payload, keys.privateKey) }, keys };
}

test("the envelope is VC 2.0-shaped: base context first, VerifiableCredential, issuer, credentialSubject", () => {
  const { card } = signedCard();
  const vc = resultCardToVc2Shape(card);
  assert.equal(VC2_CONTEXT, "https://www.w3.org/ns/credentials/v2");
  assert.deepEqual(vc["@context"], [VC2_CONTEXT]);
  assert.equal(vc.type[0], "VerifiableCredential");
  assert.ok(vc.type.includes(RESULT_CARD_VC_TYPE));
  assert.equal(vc.issuer.id, card.author);
  assert.equal(typeof vc.sig, "string");
  assert.ok(vc.sig.length > 0);
  // Exactly the five top-level keys the mapping doc promises — no proof, no
  // credentialStatus, no evidence, no validFrom, no credentialSchema.
  assert.deepEqual(Object.keys(vc).sort(), [
    "@context",
    "credentialSubject",
    "issuer",
    "sig",
    "type",
  ]);
});

test("credentialSubject is the card as signed — the author's own signature verifies against the export", () => {
  const { card } = signedCard();
  const vc = resultCardToVc2Shape(card);
  // The subject equals the signed payload: same canonical bytes, so the same
  // Ed25519 signature checks out under the pinned rule.
  assert.deepEqual(vc.credentialSubject, withoutSignature(card));
  assert.equal(verifyValue(vc.credentialSubject, vc.sig, vc.issuer.id), true);
  // A tampered subject fails — the export is not decorative.
  const tampered = { ...vc.credentialSubject, summary: "tampered after export" };
  assert.equal(verifyValue(tampered, vc.sig, vc.issuer.id), false);
});

test("the export changes no semantics: the terms hash still recomputes identically", () => {
  const { card } = signedCard();
  const vc = resultCardToVc2Shape(card);
  assert.equal(vc.credentialSubject.terms, card.terms);
  assert.equal(termsHash(vc.credentialSubject.terms), card.hash);
  // The frozen schema is intact: the card still validates through its own hash.
  for (const seed of SEED_CARDS) {
    assert.equal(termsHash(seed.terms), seed.hash, seed.room_id);
  }
});

test("no VC securing mechanism is claimed anywhere in the envelope", () => {
  const { card } = signedCard();
  const serialized = JSON.stringify(resultCardToVc2Shape(card));
  for (const forbidden of [
    '"proof"',
    '"credentialStatus"',
    '"evidence"',
    '"validFrom"',
    '"validUntil"',
    '"credentialSchema"',
    '"did:',
    "did:key",
    "conforman",
    "compliant",
  ]) {
    assert.ok(!serialized.includes(forbidden), `envelope must not contain ${forbidden}`);
  }
});

test("merged multi-card rooms: the head card's signature verifies only while agreed_by is its own", () => {
  // Two parties post their own agreed card over the same terms, the way the
  // multi-party engine emits them. The merge unions agreed_by.
  const buyer = signedCard({ agreed_by: ["buyer.demo"] });
  const seller = signedCard({ agreed_by: ["buyer.demo", "seller.demo"] });
  assert.equal(buyer.card.hash, seller.card.hash);

  const merged = mergeResultCards([buyer.card, seller.card]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].agreement, "full");
  assert.deepEqual(merged[0].agreed_by, ["buyer.demo", "seller.demo"]);

  const vc = resultCardToVc2Shape(merged[0]);
  // The documented caveat: the union no longer matches the head card's own
  // agreed_by, so the head signature does not verify against the merged
  // subject — verify against each party's own card instead.
  assert.equal(verifyValue(vc.credentialSubject, vc.sig, vc.issuer.id), false);
  assert.equal(
    verifyValue(withoutSignature(buyer.card), buyer.card.sig, buyer.card.author),
    true,
  );
  assert.equal(
    verifyValue(withoutSignature(seller.card), seller.card.sig, seller.card.author),
    true,
  );
});
