import test from "node:test";
import assert from "node:assert/strict";
import { SEED_CARDS } from "../src/lib/seed";
import { DemoTransport } from "../src/lib/transport";
import { mergeResultCards } from "../src/lib/result-card";
import { buildSignOff } from "../src/lib/human-signoff";
import { agentName, agentViews, funnelCounts, pendingDeals, readableTerms } from "../src/lib/overview";

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

test("the funnel narrows from started to confirmed, with drop-offs counted aside", async () => {
  const counts = funnelCounts(await seedRooms(), []);
  assert.deepEqual(counts, {
    started: 6,
    passedScreening: 5,
    termsFound: 3,
    allAgree: 1,
    confirmed: 0,
    blocked: 1,
    noDeal: 2,
  });
});

test("only a fully agreed deal waits for the human, and leaves once confirmed", async () => {
  const rooms = await seedRooms();
  const pending = pendingDeals(rooms, []);
  assert.deepEqual(pending.map((p) => p.room.room_id), ["room-northwind"]);

  const card = SEED_CARDS.find((c) => c.room_id === "room-northwind")!;
  const signOffs = [buildSignOff({ card })];
  assert.equal(pendingDeals(rooms, signOffs).length, 0);
  assert.equal(funnelCounts(rooms, signOffs).confirmed, 1);
});

test("agents are listed busiest first, with a plain-language status", async () => {
  const agents = agentViews(await seedRooms(), []);
  assert.equal(agents.length, 9);
  assert.equal(agents[0].name, "Acme Buyer");
  assert.match(agents[0].status, /5 deals in parallel/);
  const northwind = agents.find((a) => a.name === "Northwind Supply")!;
  assert.equal(northwind.status, "Agreed · waiting for you");
  const cy = agents.find((a) => a.name === "Cy")!;
  assert.equal(cy.status, "Still deciding");
});

test("names and terms read as a person would say them", () => {
  assert.equal(agentName("Northwind-Supply-Agent.demo"), "Northwind Supply");
  assert.deepEqual(readableTerms({ unit_price: 4.05, lead_time_days: 21, quantity: 5000 }), [
    { label: "Unit price", value: "$4.05" },
    { label: "Delivery", value: "21 days" },
    { label: "Quantity", value: "5,000" },
  ]);
});
