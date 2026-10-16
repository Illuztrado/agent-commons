import test from "node:test";
import assert from "node:assert/strict";
import { buyerTrust, counterpartyTrust } from "../src/lib/agent-trust";
import { trustBadges, trustSummary } from "../src/lib/trust-badges";

/**
 * Trust badges over the real seeded agent cards. Run with: npm test
 */

const states = (badges: { key: string; state: string }[]) =>
  Object.fromEntries(badges.map((b) => [b.key, b.state]));

test("your seeded buyer is signed and owner-verified; the rest is only claimed", () => {
  assert.deepEqual(states(buyerTrust().badges), {
    key_control: "verified",
    owner_binding: "verified",
    capability_probe: "claimed",
    screening: "claimed",
  });
});

test("a flagged counterparty fails its background check", () => {
  const shell = counterpartyTrust("room-shell");
  assert.ok(shell);
  assert.equal(states(shell.badges).screening, "failed");
  assert.equal(trustSummary(shell.badges).label, "Don't trust");
});

test("an expired card keeps its signature but loses every authority check", () => {
  const northwind = counterpartyTrust("room-northwind");
  assert.ok(northwind);
  assert.equal(northwind.lapsed, true);
  assert.deepEqual(states(northwind.badges), {
    key_control: "verified",
    owner_binding: "failed",
    capability_probe: "failed",
    screening: "failed",
  });
});

test("a counterparty that shared no card gets no badges", () => {
  assert.equal(counterpartyTrust("room-delta"), null);
});

test("unclaimed checks read as missing, not as verified", () => {
  const badges = trustBadges({
    lapsed: false,
    claims: [
      { key: "key_control", status: "evidence" },
      { key: "owner_binding", status: "unverified" },
    ],
  });
  assert.equal(states(badges).owner_binding, "missing");
  assert.equal(trustSummary(badges).label, "1 of 4 verified");
});
