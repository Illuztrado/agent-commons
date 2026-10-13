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

const checks = [];

// Board: outcomes render, and partial is never shown as full.
const board = await get("/");
checks.push(
  [board.includes("Agent Commons"), "board: product name renders", "Agent Commons"],
  [board.includes("results board"), "board: results board renders", "results board"],
  [board.includes("partial 2/3"), "board: partial shows as partial 2/3", "partial 2/3"],
  [board.includes("impasse"), "board: impasse is a first-class result", "impasse"],
);

// Room: the independent hash verification path is live.
const room = await get("/room/room-northwind");
checks.push(
  [room.includes("hash recomputes"), "room: hash recomputes independently", "hash recomputes"],
  [room.includes("agreed"), "room: fully-agreed room renders agreed", "agreed"],
);

let failed = 0;
for (const [ok, label, needle] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (${JSON.stringify(needle)})`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  throw new Error(`${failed} smoke check(s) failed`);
}
console.log(`\nOK: ${base} responded and all checks passed`);
