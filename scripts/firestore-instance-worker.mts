/**
 * One transport instance, one process. Spawned by firestore-transport-check.ts
 * so that "two instances" really means two OS processes with two SDK clients.
 *
 *   node --import tsx scripts/firestore-instance-worker.ts --action=send --room=room-x --body=...
 *
 * Config comes from the same env the app uses:
 *   FIRESTORE_EMULATOR_HOST, FIRESTORE_PROJECT_ID, FIRESTORE_COLLECTION
 *
 * Prints exactly one JSON line on stdout: { ok, action, result | error }.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreTransport } from "../src/lib/firestore-transport";
import { getTransport } from "../src/lib/transport-factory";
import type { RoomSummary } from "../src/lib/transport";
import type { ResultCard } from "../src/lib/result-card";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function out(payload: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

const safeArg = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);

const action = arg("action") ?? "";
const roomId = arg("room") ?? "";
const body = arg("body") ?? "";

try {
  if (action === "which-transport") {
    // Selection is the env switch the board relies on; report only the class name.
    out({ ok: true, action, result: { selected: getTransport().constructor.name } });
  } else if (action === "send") {
    const transport = new FirestoreTransport();
    await transport.send(roomId, body);
    // Read back through the Transport interface only — no internal access.
    const own: RoomSummary[] = await transport.listRooms();
    const row = own.find((r) => r.room_id === roomId) ?? null;
    out({
      ok: true,
      action,
      result: { room_id: roomId, visible_in_own_view: row !== null, updated_at: row?.updated_at ?? null },
    });
  } else if (action === "list-rooms") {
    out({ ok: true, action, result: await new FirestoreTransport().listRooms() });
  } else if (action === "list-cards") {
    const cards: ResultCard[] = await new FirestoreTransport().listResultCards(roomId);
    out({ ok: true, action, result: cards });
  } else if (action === "inject-junk") {
    // Test-side write that bypasses the transport: a shared public collection
    // can receive a malformed row from any other writer at any time.
    const app = getApps()[0] ?? initializeApp({ projectId: process.env.FIRESTORE_PROJECT_ID ?? "junk" });
    const db = getFirestore(app);
    const docId = `card__junk__${safeArg(roomId)}__${Date.now()}`;
    await db.collection(process.env.FIRESTORE_COLLECTION ?? "agent_commons").doc(docId).set({
      kind: "card",
      room_id: roomId,
      updated_at: new Date().toISOString(),
      card: { type: "result", v: 1, room_id: roomId },
    });
    out({ ok: true, action, result: { docId } });
  } else {
    out({ ok: false, action, error: `unknown action ${JSON.stringify(action)}` });
    process.exitCode = 2;
  }
} catch (e) {
  out({ ok: false, action, error: String((e as Error)?.stack ?? e) });
  process.exitCode = 1;
}
await new Promise((resolve) => setTimeout(resolve, 50));
process.exit(process.exitCode ?? 0);
