/**
 * HTTP smoke test for a running Agent Commons instance.
 *
 *   npm run build && npm start &      # or: docker run -p 8080:8080 ...
 *   SMOKE_BASE=http://localhost:3000 npm run smoke
 */
const base = (process.env.SMOKE_BASE ?? "http://localhost:8080").replace(/\/$/, "");

async function get(path) {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`GET ${base}${path} -> ${res.status}`);
  return res.text();
}

async function post(path, body) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${base}${path} -> ${res.status}`);
  return res.json();
}

const checks = [];

// Board: outcomes render, and partial is never shown as full.
const board = await get("/");
checks.push(
  [board.includes("Agent Commons"), "board: product name renders", "Agent Commons"],
  [board.includes("results board"), "board: results board renders", "results board"],
  [board.includes("partial 2/3"), "board: partial shows as partial 2/3", "partial 2/3"],
  [board.includes("impasse"), "board: impasse is a first-class result", "impasse"],
);

// Room: independent hash verification + claim-by-claim verification labels.
const room = await get("/room/room-northwind");
checks.push(
  [room.includes("hash recomputes"), "room: hash recomputes independently", "hash recomputes"],
  [room.includes("key authenticated"), "room: key authentication shown", "key authenticated"],
  [room.includes("claims lapsed"), "room: expired authority claims lapse, key still authenticates", "claims lapsed"],
);

// Screening flag room.
const flagged = await get("/room/room-shell");
checks.push([
  flagged.includes("Screening flag"),
  "room: synthetic screening flag is surfaced",
  "Screening flag",
]);

// Live negotiation API — converges.
const converge = await post("/api/negotiate", {
  room_id: "room-smoke-converge",
  buyer: { reservation: 4.8 },
  seller: { reservation: 4.2 },
});
checks.push(
  [converge.outcome.status === "agreed", "api: anchor negotiation converges", "agreed"],
  [converge.policy_leak.length === 0, "api: no forbidden field emitted", "policy_leak []"],
  [typeof converge.card.hash === "string" && converge.card.hash.startsWith("sha256:"), "api: result card carries a hash", "sha256:"],
  [converge.card.agreement === "full", "api: fully-agreed card reports full agreement", "full"],
);

// Live negotiation API — impasse is a first-class result.
const impasse = await post("/api/negotiate", {
  room_id: "room-smoke-impasse",
  buyer: { reservation: 3.9 },
  seller: { reservation: 4.2 },
});
checks.push([
  impasse.outcome.status === "impasse" && impasse.outcome.gap !== null,
  "api: no-overlap negotiation ends in impasse with a gap reason",
  "impasse + gap",
]);

// Demo page renders.
const demo = await get("/demo");
checks.push([demo.includes("Live negotiation"), "demo: live negotiation page renders", "Live negotiation"]);

let failed = 0;
for (const [ok, label, needle] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (${JSON.stringify(needle)})`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  throw new Error(`${failed} smoke check(s) failed`);
}
console.log(`\nOK: ${base} responded and all ${checks.length} checks passed`);
