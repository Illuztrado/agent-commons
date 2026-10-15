import test from "node:test";
import assert from "node:assert/strict";
import { SEED_CARDS } from "../src/lib/seed";
import {
  buildSignOff,
  canConfirm,
  cardStage,
  isAwaitingSignature,
  signOffFor,
  SignOffRejectedError,
} from "../src/lib/human-signoff";

/**
 * Unit tests for the human terminal step — the point where a person, not an
 * agent, closes a negotiation. Run with: npm test
 *
 * These use the real seed cards (real hashes, real `next_step` values), not
 * fixtures, so they fail if the seeded story stops exercising this path.
 */

function card(roomId: string) {
  const found = SEED_CARDS.find((c) => c.room_id === roomId);
  if (!found) throw new Error(`seed card missing for ${roomId}`);
  return found;
}

test("a result card that stops at awaiting_signature is where the human enters", () => {
  assert.equal(isAwaitingSignature(card("room-northwind")), true);
  assert.equal(isAwaitingSignature(card("room-orion")), false);
});

test("a sign-off is bound to the room and to the exact terms hash it confirms", () => {
  const northwind = card("room-northwind");
  const off = buildSignOff({
    card: northwind,
    displayName: "Jem",
    at: "2026-10-16T09:00:00.000Z",
  });
  assert.equal(off.room_id, "room-northwind");
  assert.equal(off.hash, northwind.hash);
  assert.equal(off.display_name, "Jem");
  assert.equal(off.signed_off_at, "2026-10-16T09:00:00.000Z");
});

test("a confirmation records the moment it was made", () => {
  const northwind = card("room-northwind");
  const off = buildSignOff({ card: northwind });
  const at = Date.parse(off.signed_off_at);
  const now = Date.now();
  assert.ok(Number.isFinite(at), `not an ISO instant: ${off.signed_off_at}`);
  assert.ok(at <= now + 1000 && at >= now - 60_000, `stamped ${off.signed_off_at}, now ${new Date(now).toISOString()}`);
});

test("a card that never stopped at awaiting_signature cannot be signed off", () => {
  // An impasse has nothing to confirm...
  assert.throws(() => buildSignOff({ card: card("room-orion") }), SignOffRejectedError);
  // ...and a multi-party room still held by `awaiting_confirmation` is a
  // different step: the agents are not done yet.
  assert.throws(() => buildSignOff({ card: card("room-weekend") }), SignOffRejectedError);
});

test("the stage a card shows is decided by whether a human has closed it", () => {
  const northwind = card("room-northwind");
  assert.equal(cardStage(northwind, []), "awaiting_signature");
  assert.equal(canConfirm(northwind, []), true);

  const off = buildSignOff({
    card: northwind,
    displayName: "Jem",
    at: "2026-10-16T09:00:00.000Z",
  });
  assert.equal(cardStage(northwind, [off]), "signed_off");
  assert.equal(canConfirm(northwind, [off]), false);
});

test("a sign-off does not carry over to a renegotiated card under a new hash", () => {
  const northwind = card("room-northwind");
  const off = buildSignOff({
    card: northwind,
    displayName: "Jem",
    at: "2026-10-16T09:00:00.000Z",
  });
  const renegotiated = { ...northwind, hash: "sha256:different-terms" };
  assert.equal(cardStage(renegotiated, [off]), "awaiting_signature");
  assert.equal(canConfirm(renegotiated, [off]), true);
});

test("the same card cannot be confirmed twice", () => {
  const northwind = card("room-northwind");
  const first = buildSignOff({ card: northwind, displayName: "Jem" });
  assert.throws(
    () => buildSignOff({ card: northwind, displayName: "Someone else" }, [first]),
    SignOffRejectedError,
  );
});

test("a board row closes only on a sign-off that matches the room's current hash", () => {
  const northwind = card("room-northwind");
  const off = buildSignOff({
    card: northwind,
    displayName: "Jem",
    at: "2026-10-16T09:00:00.000Z",
  });
  assert.equal(signOffFor([off], "room-northwind", northwind.hash)?.display_name, "Jem");
  assert.equal(signOffFor([off], "room-northwind", "sha256:other"), undefined);
  assert.equal(signOffFor([off], "room-delta", northwind.hash), undefined);
});

test("a confirmation with no usable name is attributed to the demo signer", () => {
  const northwind = card("room-northwind");
  assert.equal(buildSignOff({ card: northwind }).display_name, "demo-human");
  assert.equal(
    buildSignOff({ card: northwind, displayName: "   " }).display_name,
    "demo-human",
  );
  assert.equal(
    buildSignOff({ card: northwind, displayName: " Jem " }).display_name,
    "Jem",
  );
});
