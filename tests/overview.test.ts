import test from "node:test";
import assert from "node:assert/strict";
import { SEED_CARDS } from "../src/lib/seed";
import { DemoTransport } from "../src/lib/transport";
import { mergeResultCards } from "../src/lib/result-card";
import { buildSignOff } from "../src/lib/human-signoff";
import { agentName, buildOverview, funnelStages, readableTerms } from "../src/lib/overview";

/**
 * The overview page's derivations, over the real seed story.
 * Run with: npm test
 */

async function seedRooms() {
  const transport = new DemoTransport();
  const rooms = await transport.listRooms();
  return Promise.all(
    rooms.map(async (room) => ({
      room,
      cards: mergeResultCards(await transport.listResultCards(room.room_id)),
    })),
  );
}

test("the overview tells the procurement story only, from the buyer's side", async () => {
  const { buyer, suppliers } = buildOverview(await seedRooms(), []);
  assert.equal(buyer?.name, "Acme Buyer");
  assert.deepEqual(
    suppliers.map((s) => s.name).sort(),
    ["Delta Parts", "Northwind Supply", "Orion Components", "Shell Co", "Vega Metals"],
  );
});

test("the funnel narrows from contacted to confirmed", async () => {
  const { funnel } = buildOverview(await seedRooms(), []);
  assert.deepEqual(funnel, {
    contacted: 5,
    passedCheck: 4,
    supplierAccepted: 2,
    bothAgreed: 1,
    confirmed: 0,
  });
});

test("dropped suppliers are named with the step they dropped at", async () => {
  const { suppliers } = buildOverview(await seedRooms(), []);
  const dropped = Object.fromEntries(suppliers.map((s) => [s.name, s.dropped]));
  assert.equal(dropped["Shell Co"], "check");
  assert.equal(dropped["Orion Components"], "no-deal");
  assert.equal(dropped["Vega Metals"], "no-deal");
  assert.equal(dropped["Northwind Supply"], null);
});

test("only a fully agreed deal waits for the human, and leaves once confirmed", async () => {
  const rooms = await seedRooms();
  const before = buildOverview(rooms, []);
  assert.deepEqual(before.pending.map((p) => p.supplier), ["Northwind Supply"]);
  assert.equal(before.suppliers[0].status, "Deal agreed · waiting for you");

  const card = SEED_CARDS.find((c) => c.room_id === "room-northwind")!;
  const after = buildOverview(rooms, [buildSignOff({ card })]);
  assert.equal(after.pending.length, 0);
  assert.equal(after.funnel.confirmed, 1);
  assert.equal(after.suppliers.find((s) => s.name === "Northwind Supply")?.status, "Deal closed");
});

test("names and terms read as a person would say them", () => {
  assert.equal(agentName("Northwind-Supply-Agent.demo"), "Northwind Supply");
  assert.equal(agentName("alex"), "Alex");
  assert.deepEqual(readableTerms({ unit_price: 4.05, lead_time_days: 21, quantity: 5000 }), [
    { label: "Unit price", value: "$4.05" },
    { label: "Delivery", value: "21 days" },
    { label: "Quantity", value: "5,000" },
  ]);
});

test("each funnel stage carries its order value and pass-through rate", async () => {
  const { suppliers } = buildOverview(await seedRooms(), []);
  const stages = funnelStages(suppliers);
  assert.deepEqual(
    stages.map((s) => [s.count, s.value, s.pct]),
    [
      [5, 39290, null],
      [4, 39290, 80],
      [2, 31530, 50],
      [1, 20250, 50],
      [0, 0, 0],
    ],
  );
});
