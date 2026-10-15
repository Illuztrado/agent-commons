/**
 * Acceptance check #2 — FirestoreTransport across two instances.
 *
 * Boots a Firestore emulator in-process (pure Node, no Java), then spawns
 * separate Node processes. Each process builds its own FirestoreTransport and
 * its own Firestore client, so a write that only lived in one process's memory
 * cannot pass this.
 *
 *   npm run check:transport
 *
 * To run the same assertions against a real Firestore project (ADC + project
 * id, nothing emulated), point FIRESTORE_EMULATOR_HOST at a live datastore or
 * clear it and set FIRESTORE_PROJECT_ID — the instance side is unchanged. That
 * real-project pass is not part of this local run.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";
import path from "node:path";
import { FirestoreServer } from "@firestore-emulator/server";
import { termsHash } from "../src/lib/canonical";
import type { RoomSummary } from "../src/lib/transport";
import type { ResultCard } from "../src/lib/result-card";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const worker = path.join(here, "firestore-instance-worker.mts");
const preferredPort = process.env.FIRESTORE_TEST_PORT ? Number(process.env.FIRESTORE_TEST_PORT) : undefined;
const projectId = process.env.FIRESTORE_PROJECT_ID ?? "agent-commons-check";
const collection = process.env.FIRESTORE_COLLECTION ?? "agent_commons";

type WorkerResult<T> = { ok: true; action: string; result: T } | { ok: false; action: string; error: string };

const checks: Array<[boolean, string, string]> = [];
function check(label: string, ok: boolean, detail = "") {
  checks.push([ok, label, detail]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  -> ${detail}` : ""}`);
}

/**
 * Run one transport instance in its own process and parse its JSON line.
 *
 * Must stay async: the datastore is served from *this* process, and a
 * synchronous spawn would freeze the event loop that answers gRPC — every child
 * would then hang until it was killed.
 */
function instance<T>(args: string[], label: string, extraEnv: Record<string, string> = {}): Promise<T | null> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", worker, ...args], {
      cwd: root,
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: `127.0.0.1:${emulatorPort}`,
        FIRESTORE_PROJECT_ID: projectId,
        FIRESTORE_COLLECTION: collection,
        ...extraEnv,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    const killer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("error", (e) => {
      clearTimeout(killer);
      check(`${label} (instance ran)`, false, `spawn failed: ${e.message}`);
      resolve(null);
    });
    child.on("close", (code, signal) => {
      clearTimeout(killer);
      const jsonLine = stdout.trim().split("\n").reverse().find((l) => l.startsWith("{"));
      if (!jsonLine) {
        check(`${label} (instance ran)`, false, `no JSON on stdout, exit=${code ?? signal}; ${stderr.slice(-400)}`);
        resolve(null);
        return;
      }
      const parsed = JSON.parse(jsonLine) as WorkerResult<T>;
      if (!parsed.ok) {
        check(`${label} (instance ran)`, false, parsed.error.slice(0, 400));
        resolve(null);
        return;
      }
      resolve(parsed.result);
    });
  });
}

/** Root collection names present in the datastore, read off the server itself. */
type StateJson = Record<
  string,
  { databases: Record<string, { collections: Record<string, { documents: Record<string, unknown> }> }> }
>;
function rootCollections(): string[] {
  const json = server.state.toJSON() as unknown as StateJson;
  const names = new Set<string>();
  for (const project of Object.values(json.projects ?? {})) {
    for (const database of Object.values(project.databases ?? {})) {
      for (const name of Object.keys(database.collections ?? {})) names.add(name);
    }
  }
  return [...names].sort();
}
function docCount(): number {
  const json = server.state.toJSON() as unknown as StateJson;
  let n = 0;
  for (const project of Object.values(json.projects ?? {})) {
    for (const database of Object.values(project.databases ?? {})) {
      for (const col of Object.values(database.collections ?? {})) n += Object.keys(col.documents ?? {}).length;
    }
  }
  return n;
}

/** A port nobody is holding, so a second suite run cannot steal the datastore. */
function isFreePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

async function bootDatastore(): Promise<{ server: FirestoreServer; port: number }> {
  const candidates = preferredPort
    ? [preferredPort]
    : Array.from({ length: 24 }, () => 20000 + Math.floor(Math.random() * 20000));
  for (const port of candidates) {
    if (!(await isFreePort(port))) continue;
    const candidate = new FirestoreServer();
    try {
      await candidate.start(port);
      return { server: candidate, port };
    } catch (e) {
      console.log(`  port ${port} unusable: ${String((e as Error)?.message ?? e).slice(0, 80)}`);
    }
  }
  throw new Error("could not bind a Firestore datastore on any candidate port");
}

// --- boot the datastore ----------------------------------------------------
const { server, port: emulatorPort } = await bootDatastore();
console.log(`datastore: firestore on 127.0.0.1:${emulatorPort} (project ${projectId}, collection ${collection})`);
check("cold start: the library begins empty", docCount() === 0, `docs=${docCount()}`);

const liveRoom = `room-live-check-${Date.now()}`;
const body = JSON.stringify({ type: "message", v: 1, room_id: liveRoom, body: "hello from instance A" });

// --- instance A writes -----------------------------------------------------
const sent = await instance<{ room_id: string; visible_in_own_view: boolean; updated_at: string | null }>(
  [`--action=send`, `--room=${liveRoom}`, `--body=${body}`],
  "instance A send",
);
check(
  "instance A: send() lands and reads back through the interface",
  sent?.room_id === liveRoom && sent?.visible_in_own_view === true && typeof sent?.updated_at === "string",
  JSON.stringify(sent),
);

// --- instance B: a different process must see it ---------------------------
const roomsB = await instance<RoomSummary[]>([`--action=list-rooms`], "instance B listRooms");
const seenLive = roomsB?.find((r) => r.room_id === liveRoom) ?? null;
check(
  "instance B: the room instance A wrote is visible in listRooms",
  seenLive !== null,
  seenLive ? `${seenLive.room_id} status=${seenLive.status}` : `rooms=${roomsB?.length ?? 0}`,
);
check(
  "instance B: a cardless room rolls up as negotiating",
  seenLive?.status === "negotiating" && seenLive.required_parties === 0 && seenLive.agreed_parties === 0,
  JSON.stringify(seenLive && { s: seenLive.status, r: seenLive.required_parties, a: seenLive.agreed_parties }),
);
check(
  "instance B: RoomSummary carries every field the board renders",
  seenLive !== null &&
    typeof seenLive.scenario === "string" &&
    typeof seenLive.scenario_label === "string" &&
    Array.isArray(seenLive.participants) &&
    typeof seenLive.summary === "string" &&
    typeof seenLive.updated_at === "string" &&
    !Number.isNaN(Date.parse(seenLive.updated_at)),
  seenLive ? Object.keys(seenLive).join(",") : "no row",
);

// --- first-boot seeding ----------------------------------------------------
const SEEDDED = ["room-northwind", "room-delta", "room-orion", "room-vega", "room-shell", "room-weekend"];
const seeded = (roomsB ?? []).filter((r) => r.room_id !== liveRoom);
check(
  "seed: an empty library was seeded from src/lib/seed.ts on first boot",
  seeded.length === SEEDDED.length && SEEDDED.every((id) => seeded.some((r) => r.room_id === id)),
  `rooms=${seeded.map((r) => r.room_id).join(", ")}`,
);
const statusOf = (id: string) => seeded.find((r) => r.room_id === id)?.status ?? "missing";
check(
  "seed: statuses roll up exactly like the demo story (agreed / partial / impasse / no-match)",
  statusOf("room-northwind") === "agreed" &&
    statusOf("room-delta") === "partial" &&
    statusOf("room-orion") === "impasse" &&
    statusOf("room-vega") === "impasse" &&
    statusOf("room-shell") === "no-match" &&
    statusOf("room-weekend") === "partial",
  SEEDDED.map((id) => `${id}=${statusOf(id)}`).join(" "),
);
const agreed = seeded.find((r) => r.room_id === "room-delta");
const weekend = seeded.find((r) => r.room_id === "room-weekend");
check(
  "seed: partial keeps its count instead of being shown as full",
  agreed?.agreed_parties === 1 && agreed?.required_parties === 2 && weekend?.agreed_parties === 2 && weekend?.required_parties === 3,
  `delta=${agreed?.agreed_parties}/${agreed?.required_parties} weekend=${weekend?.agreed_parties}/${weekend?.required_parties}`,
);
check(
  "seed: every seeded room carries a real recomputable hash",
  seeded.filter((r) => r.status !== "no-match").length > 0 &&
    seeded.filter((r) => r.status !== "no-match").every((r) => typeof r.hash === "string" && r.hash.startsWith("sha256:")),
  seeded.map((r) => `${r.room_id}:${r.hash?.slice(7, 14) ?? "-"}`).join(" "),
);

// --- cards survive the round trip -----------------------------------------
const northwind = await instance<ResultCard[]>([`--action=list-cards`, `--room=room-northwind`], "instance B listResultCards");
check("cards: room-northwind cards come back from Firestore", (northwind ?? []).length === 1, `count=${northwind?.length ?? 0}`);
check(
  "cards: each stored card's hash still recomputes from its terms alone",
  (northwind ?? []).length > 0 && (northwind ?? []).every((c) => termsHash(c.terms) === c.hash),
  (northwind ?? []).map((c) => `${c.hash.slice(7, 15)} vs ${termsHash(c.terms).slice(7, 15)}`).join(" "),
);
check(
  "cards: schema fields survive — parties, agreement, next_step, author",
  (northwind ?? []).length > 0 &&
    (northwind ?? []).every(
    (c) =>
      c.type === "result" &&
      c.v === 1 &&
      c.participants.length === 2 &&
      c.required_parties.length === 2 &&
      c.agreed_by.length === 2 &&
      c.agreement === "full" &&
      typeof c.author === "string" &&
      c.next_step === "awaiting_signature" &&
      typeof c.terms.unit_price === "number",
  ),
  JSON.stringify(northwind?.[0] && { a: northwind[0].agreement, n: northwind[0].next_step, p: northwind[0].terms.unit_price }),
);

const multiCards = await instance<ResultCard[]>([`--action=list-cards`, `--room=room-weekend`], "multi room cards");
check(
  "routing: listResultCards(room) returns only that room's cards",
  (multiCards ?? []).length === 1 && (multiCards ?? []).every((c) => c.room_id === "room-weekend"),
  `count=${multiCards?.length ?? 0} rooms=${[...new Set((multiCards ?? []).map((c) => c.room_id))].join(",")}`,
);

const emptyRoomCards = await instance<ResultCard[]>([`--action=list-cards`, `--room=${liveRoom}`], "live room cards");
check(
  "empty: a room with no cards returns [], not the whole library",
  Array.isArray(emptyRoomCards) && emptyRoomCards.length === 0,
  `count=${emptyRoomCards?.length ?? -1}`,
);

// --- a later write from a third process, read by a fourth ------------------
const firstUpdatedAt = seenLive?.updated_at ?? "";
const body2 = JSON.stringify({ type: "message", v: 1, room_id: liveRoom, body: "second message" });
await instance([`--action=send`, `--room=${liveRoom}`, `--body=${body2}`], "instance C send");
const roomsD = await instance<RoomSummary[]>([`--action=list-rooms`], "instance D listRooms");
const seenAgain = roomsD?.find((r) => r.room_id === liveRoom) ?? null;
check(
  "cross-instance: instance C's write changes what instance D reads",
  !!seenAgain && seenAgain.updated_at !== firstUpdatedAt,
  `${firstUpdatedAt} -> ${seenAgain?.updated_at ?? "missing"}`,
);

// --- the env switch the board depends on -----------------------------------
const pickedFirestore = await instance<{ selected: string }>(
  [`--action=which-transport`],
  "instance E transport selection",
  { TRANSPORT: "firestore" },
);
check(
  "switch: TRANSPORT=firestore selects FirestoreTransport",
  pickedFirestore?.selected === "FirestoreTransport",
  JSON.stringify(pickedFirestore),
);
const pickedDemo = await instance<{ selected: string }>([`--action=which-transport`], "instance F transport selection", {
  TRANSPORT: "",
});
check(
  "switch: with TRANSPORT unset the board still gets DemoTransport (unchanged fallback)",
  pickedDemo?.selected === "DemoTransport",
  JSON.stringify(pickedDemo),
);

// --- a shared public collection gets writers we do not control -------------
const junkRoom = `room-junk-${Date.now()}`;
await instance([`--action=inject-junk`, `--room=${junkRoom}`], "instance I inject junk row");
const junkCards = await instance<ResultCard[]>([`--action=list-cards`, `--room=${junkRoom}`], "junk room cards");
check(
  "hostile row: a malformed card in the shared collection is not handed out as a card",
  Array.isArray(junkCards) && junkCards.length === 0,
  `count=${junkCards?.length ?? -1}`,
);
const roomsAfterJunk = await instance<RoomSummary[]>([`--action=list-rooms`], "instance J listRooms after junk");
const northwindAfterJunk = roomsAfterJunk?.find((r) => r.room_id === "room-northwind") ?? null;
check(
  "hostile row: one bad document cannot take the board down with it",
  (roomsAfterJunk ?? []).length >= SEEDDED.length + 2 &&
    northwindAfterJunk?.status === "agreed" &&
    northwindAfterJunk?.agreed_parties === 2,
  `rooms=${roomsAfterJunk?.length ?? 0} northwind=${northwindAfterJunk?.status ?? "missing"}`,
);

// --- ids longer than Firestore allows --------------------------------------
const longRoom = `room-${"x".repeat(700)}`;
const longSent = await instance<{ room_id: string; visible_in_own_view: boolean }>(
  [`--action=send`, `--room=${longRoom}`, `--body=${JSON.stringify({ type: "message", body: "long id" })}`],
  "instance G send to long room id",
);
check(
  "long id: a room id past the document-id cap still writes and reads back",
  longSent?.room_id === longRoom && longSent?.visible_in_own_view === true,
  `len=${longRoom.length} ${JSON.stringify(longSent)?.slice(0, 60)}`,
);
const roomsAfterLong = await instance<RoomSummary[]>([`--action=list-rooms`], "instance H listRooms after long id");
check(
  "long id: the long room keeps its full id and does not collide with another row",
  roomsAfterLong?.some((r) => r.room_id === longRoom) === true &&
    roomsAfterLong?.some((r) => r.room_id === liveRoom) === true,
  `rooms=${roomsAfterLong?.length ?? 0}`,
);

// --- shared mode: one public collection ------------------------------------
check(
  "shared mode: exactly one public collection exists, and it is the configured one",
  rootCollections().length === 1 && rootCollections()[0] === collection,
  JSON.stringify(rootCollections()),
);
check(
  "shared mode: no per-user or per-room namespace was created",
  docCount() > 0 && rootCollections().every((c) => c === collection),
  `docs=${docCount()} collections=${rootCollections().join(",")}`,
);
check(
  "idempotence: re-running the first-boot seed does not duplicate rows",
  (roomsB ?? []).length === SEEDDED.length + 1 && (roomsD ?? []).length === (roomsB ?? []).length,
  `B=${roomsB?.length} D=${roomsD?.length} expected=${SEEDDED.length + 1}`,
);

server.stop();

const failed = checks.filter(([ok]) => !ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed > 0) {
  console.error(`${failed} transport check(s) failed`);
  process.exit(1);
}
console.log(`OK: separate processes shared the ${collection} collection through FirestoreTransport`);
process.exit(0);
