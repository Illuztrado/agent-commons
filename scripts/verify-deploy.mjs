/**
 * Read-only verification of a deployed Agent Commons instance.
 *
 *   node scripts/verify-deploy.mjs https://agent-commons-xxxx.run.app
 *
 * Why not just run `npm run smoke`? Because smoke signs off room-northwind — it
 * needs a write, and a write would leave the deployed board with the deal
 * already confirmed before anyone records the demo. This script only reads, so
 * it can be run any number of times, including immediately before recording.
 *
 * The five things that must be true for the submission to be honest:
 *   1. the app answers at all
 *   2. the board is backed by Firestore, not an empty in-memory seed
 *   3. the MCP gate is reachable anonymously from the public internet
 *   4. the issuer key directory is populated (cards are really signed)
 *   5. the guide is answered by Gemini — not the deterministic fallback
 */
const base = (process.argv[2] ?? process.env.DEPLOY_URL ?? "").replace(/\/$/, "");
if (!base) {
  console.error("usage: node scripts/verify-deploy.mjs https://your-service.run.app");
  process.exit(2);
}

const results = [];
function record(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

async function req(path, init) {
  const res = await fetch(base + path, init);
  const text = await res.text();
  return { status: res.status, text };
}

// 1 — the app answers.
try {
  const { status } = await req("/");
  record(status === 200, "home page responds 200", `http ${status}`);
} catch (error) {
  record(false, "home page responds 200", String(error));
}

// 2 — the board is really populated (seedIfEmpty ran against Firestore).
// The home page carries the funnel and renders server-side; /board fills in on
// the client, so its HTML alone says nothing about the data behind it.
try {
  const { status, text } = await req("/");
  const hasBuyer = text.includes("Harbourline");
  record(status === 200 && hasBuyer, "home page shows the seeded sourcing round", hasBuyer ? "Harbourline present" : "no Harbourline in HTML");
} catch (error) {
  record(false, "home page shows the seeded sourcing round", String(error));
}

// 3 — the gate is open to the public internet, no session, no login.
try {
  const { status, text } = await req("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  // The endpoint may answer as SSE; pull the JSON-RPC payload out of the data: lines.
  const payload = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  const parsed = JSON.parse(payload || text);
  const names = (parsed.result?.tools ?? []).map((tool) => tool.name).sort();
  const expected = ["list_rooms", "post_result_card", "read_result_cards", "verify_terms"];
  const ok = status === 200 && expected.every((name) => names.includes(name));
  record(ok, "MCP gate answers anonymously with four tools", names.join(", ") || "no tools");
} catch (error) {
  record(false, "MCP gate answers anonymously with four tools", String(error));
}

// 4 — signed cards imply a populated issuer directory.
try {
  const { status, text } = await req("/.well-known/agent-commons-keys");
  const body = JSON.parse(text);
  const keys = body.keys?.length ?? 0;
  const issuers = body.issuers?.length ?? 0;
  record(status === 200 && keys > 0 && keys === issuers, "issuer key directory is populated", `${keys} keys / ${issuers} issuers`);
} catch (error) {
  record(false, "issuer key directory is populated", String(error));
}

// 5 — the one that decides whether the video may say "this is Gemini".
try {
  const { status, text } = await req("/api/guide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "Why is Delta not closed yet?" }),
  });
  const body = JSON.parse(text);
  const ok = status === 200 && body.source === "gemini";
  record(ok, "guide is answered by Gemini", `source=${body.source ?? "?"} model=${body.model ?? "?"}`);
  if (!ok) {
    console.log("      -> the Gemini beat in the video cannot be recorded until this passes.");
  }
} catch (error) {
  record(false, "guide is answered by Gemini", String(error));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.log("Not ready to submit. Failing: " + failed.map((r) => r.label).join("; "));
  process.exit(1);
}
console.log(`\nReady. Fill this URL into deck page 13 and the brief description:\n  ${base}`);
