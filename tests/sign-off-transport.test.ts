import test from "node:test";
import { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DemoTransport, type Transport } from "../src/lib/transport";
import { mergeResultCards, type ResultCard } from "../src/lib/result-card";
import {
  buildSignOff,
  cardStage,
  SignOffRejectedError,
  type HumanSignOff,
} from "../src/lib/human-signoff";
import { SEED_CARDS } from "../src/lib/seed";
import { getSignOffTransport, roomStage, withSignOffs } from "../src/lib/sign-off-transport";

/**
 * The sign-off state has to live in the transport, not in a component — that is
 * what makes the board, the room page and the next page load agree. These tests
 * run against the real DemoTransport and the real seed cards.
 */

beforeEach(() => {
  // The history is process-wide on purpose (see sign-off-transport.ts), so each
  // case starts from an empty one. The key is the same `Symbol.for` the module
  // uses; nothing here needs a test-only hook in production code.
  (globalThis as Record<symbol, unknown>)[Symbol.for("agent-commons.sign-offs")] = [];
});

async function head(store: Transport, roomId: string): Promise<ResultCard> {
  const [card] = mergeResultCards(await store.listResultCards(roomId));
  if (!card) throw new Error(`${roomId} has no result card`);
  return card;
}

test("a confirmation recorded through the transport closes the card for every reader", async () => {
  const store = withSignOffs(new DemoTransport());
  const card = await head(store, "room-northwind");
  assert.equal(cardStage(card, []), "awaiting_signature");

  await store.recordSignOff({
    room_id: "room-northwind",
    hash: card.hash,
    display_name: "Jem",
  });

  const signOffs: HumanSignOff[] = await store.listSignOffs();
  assert.equal(signOffs.length, 1);
  assert.equal(cardStage(card, signOffs), "signed_off");
});

test("a confirmation is a separate record, not a rewrite of the agents' card", async () => {
  const inner = new DemoTransport();
  const store = withSignOffs(inner);
  const card = await head(store, "room-northwind");
  const before = structuredClone(await inner.listResultCards("room-northwind"));

  await store.recordSignOff({
    room_id: "room-northwind",
    hash: card.hash,
    display_name: "Jem",
  });

  // What the agents posted is, field for field, what any later reader gets.
  assert.deepEqual(await inner.listResultCards("room-northwind"), before);
  const [posted] = mergeResultCards(await store.listResultCards("room-northwind"));
  assert.equal(posted?.next_step, "awaiting_signature");
  // The closure is derived from the separate record, never stored on the card.
  assert.equal(cardStage(posted!, await store.listSignOffs()), "signed_off");
});

test("a second reader of the shared transport sees the confirmation", async () => {
  const roomPage = getSignOffTransport();
  const card = await head(roomPage, "room-northwind");
  await roomPage.recordSignOff({
    room_id: "room-northwind",
    hash: card.hash,
    display_name: "Jem",
  });

  // The board is a different call site, possibly a later request: same store.
  const board = getSignOffTransport();
  const signOffs = await board.listSignOffs();
  assert.equal(cardStage(card, signOffs), "signed_off");
});

test("separate copies of the module — what each server route gets — share one store", async () => {
  // Next bundles every server route on its own: two module instances of the
  // same file, which is why the API route that records a confirmation and the
  // page that displays it cannot keep the history on a module-level array.
  const modulePath = require.resolve("../src/lib/sign-off-transport");
  const loadFresh = () => {
    delete require.cache[modulePath];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(modulePath) as typeof import("../src/lib/sign-off-transport");
  };
  const apiRoute = loadFresh();
  const page = loadFresh();
  if (apiRoute === page) throw new Error("the two loads were not separate copies");

  const card = await head(page.withSignOffs(new DemoTransport()), "room-northwind");
  await apiRoute.withSignOffs(new DemoTransport()).recordSignOff({
    room_id: "room-northwind",
    hash: card.hash,
    display_name: "Jem",
  });

  assert.equal((await page.withSignOffs(new DemoTransport()).listSignOffs()).length, 1);
});

test("a board row reports the human stage of the result its room rolled up to", () => {
  const northwind = SEED_CARDS.find((c) => c.room_id === "room-northwind")!;
  const closed = buildSignOff({
    card: northwind,
    displayName: "Jem",
    at: "2026-10-16T09:00:00.000Z",
  });

  assert.equal(roomStage([northwind], []), "awaiting_signature");
  assert.equal(roomStage([northwind], [closed]), "signed_off");
  // An impasse room never reached the human step, so it has none to show.
  assert.equal(roomStage([SEED_CARDS.find((c) => c.room_id === "room-orion")!], []), null);
});

test("the transport refuses a hash that is not on the board in that room", async () => {
  const store = withSignOffs(new DemoTransport());
  await assert.rejects(
    () =>
      store.recordSignOff({
        room_id: "room-northwind",
        hash: "sha256:invented",
        display_name: "Jem",
      }),
    SignOffRejectedError,
  );
  assert.equal((await store.listSignOffs()).length, 0);
});

test("the transport refuses to close a room that never reached the human step", async () => {
  const store = withSignOffs(new DemoTransport());
  const impasse = await head(store, "room-orion");
  await assert.rejects(
    () => store.recordSignOff({ room_id: "room-orion", hash: impasse.hash }),
    SignOffRejectedError,
  );
  assert.equal((await store.listSignOffs()).length, 0);
});
