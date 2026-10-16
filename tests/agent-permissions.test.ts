import test from "node:test";
import assert from "node:assert/strict";
import { completePolicy, permissionItems, togglePermission } from "../src/lib/agent-permissions";
import { buyerProfile } from "../src/lib/agent-trust";
import { createAgentCard } from "../src/lib/agent-card-build";
import { assessCard } from "../src/lib/agent-card";
import { verifyCard } from "../src/lib/agent-card-demo";
import { trustBadges } from "../src/lib/trust-badges";
import { buyerTrust } from "../src/lib/agent-trust";

/** Agent permission switches over the seeded buyer's real policy. Run with: npm test */

test("the seeded buyer shares specs but keeps its walk-away price private", () => {
  const items = Object.fromEntries(permissionItems(buyerProfile().policy).map((i) => [i.key, i.allowed]));
  assert.equal(items.spec, true);
  assert.equal(items["walk-away-price"], false);
  assert.equal(items["budget-ceiling"], false, "unlisted items count as private");
});

test("a switch moves an item between the two lists, never into both", () => {
  const start = { may: ["spec"], never: ["walk-away-price"] };
  const opened = togglePermission(start, "walk-away-price");
  assert.deepEqual(opened, { may: ["spec", "walk-away-price"], never: [] });
  assert.deepEqual(togglePermission(opened, "walk-away-price"), start);
});

test("the signed policy writes every switch out explicitly", () => {
  const full = completePolicy({ may: ["spec"], never: [] });
  assert.ok(full.never.includes("internal-cost-basis"));
  assert.equal(full.may.length + full.never.length, permissionItems(full).length);
});

test("re-signing the seeded buyer with new permissions keeps the same trust badges", () => {
  const profile = buyerProfile();
  const card = createAgentCard({
    display_name: "Acme Buyer Agent",
    owner_name: "Acme Corp",
    owner_contact: profile.contact ?? undefined,
    capabilities: profile.capabilities,
    may_disclose: ["spec"],
    must_not_disclose: ["walk-away-price"],
    levels: { owner_binding: true, capability_probe: true, screening: true },
  });
  const states = (b: { key: string; state: string }[]) => b.map((x) => `${x.key}:${x.state}`);
  assert.deepEqual(
    states(trustBadges(assessCard(card, verifyCard(card)))),
    states(buyerTrust().badges),
  );
});
