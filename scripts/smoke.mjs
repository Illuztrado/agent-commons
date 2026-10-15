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
  [
    room.includes("evidence signature vs issuer key"),
    "room: evidence is checked against its issuer key, not trusted as a label",
    "evidence signature vs issuer key",
  ],
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

// Agent card editor + builder.
const agentPage = await get("/agent");
checks.push([
  agentPage.includes("Agent card editor"),
  "agent: card editor page renders",
  "Agent card editor",
]);

const built = await post("/api/agent-card", {
  display_name: "Test Agent",
  owner_name: "Test Co",
  capabilities: ["negotiate-price"],
  may_disclose: ["spec"],
  must_not_disclose: ["walk-away-price"],
  levels: {},
});
checks.push(
  [
    built.card.claims.owner_binding.status === "unverified",
    "api: unevidenced claim is unverified, never a bare boolean",
    "unverified",
  ],
  [
    built.card.claims.capability_probe.status === "self_reported",
    "api: capability without a probe is self-reported",
    "self_reported",
  ],
  [
    typeof built.card.sig === "string" && built.card.sig.length > 0,
    "api: agent card is signed",
    "sig",
  ],
  [built.assessment.keyAuthenticated === true, "api: agent card key authenticates", "true"],
);

// Owner binding: signed by a separate owner key and bound to the agent key.
const bound = await post("/api/agent-card", {
  display_name: "Owner-bound Agent",
  owner_name: "Test Co",
  owner_contact: "ops@test.example",
  levels: { owner_binding: true },
});
checks.push(
  [
    bound.card.claims.owner_binding.status === "evidence",
    "api: owner binding is evidence-backed",
    "evidence",
  ],
  [
    typeof bound.card.claims.owner_binding.evidence?.issuer === "string",
    "api: evidence carries an issuer KEY, not just a producer label",
    "issuer",
  ],
  [
    bound.card.claims.owner_binding.evidence?.payload.agent_id === bound.card.agent_id,
    "api: the challenge is bound to the agent key",
    "agent_id bound",
  ],
  [
    bound.card.claims.owner_binding.evidence?.produced_by === "owner",
    "api: owner binding is produced by the owner, not the agent",
    "owner",
  ],
  [
    bound.card.claims.screening.status !== "evidence",
    "api: screening never claims independent evidence",
    "not evidence",
  ],
  [bound.assessment.level === "L1", "api: owner-bound card reaches L1", "L1"],
);

// Screening, when requested, is self-reported — never dressed up as evidence.
const screened = await post("/api/agent-card", {
  display_name: "Screened Agent",
  owner_name: "Test Co",
  levels: { screening: true, capability_probe: true },
});
checks.push(
  [
    screened.card.claims.screening.status === "self_reported",
    "api: requested screening is self-reported, not evidence",
    "self_reported",
  ],
  [
    screened.card.claims.capability_probe.status === "self_reported",
    "api: requested probe is self-reported, not evidence",
    "self_reported",
  ],
  [
    screened.assessment.level === "L0",
    "api: a card with no verifiable authority claim stays at L0",
    "L0",
  ],
);

// Multi-party consensus (scenario 4).
const multi = await post("/api/negotiate-multi", { preset: "agree" });
checks.push(
  [multi.status === "agreed", "multi: three agents reach consensus", "agreed"],
  [
    multi.progression.length === 3 &&
      multi.progression[0].agreement === "partial" &&
      multi.progression[1].agreement === "partial" &&
      multi.progression[2].agreement === "full",
    "multi: agreement climbs partial -> partial -> full",
    "1/3, 2/3, 3/3",
  ],
  [multi.final.agreement === "full", "multi: final card is full agreement", "full"],
);

const multiNoMatch = await post("/api/negotiate-multi", { preset: "no-match" });
checks.push([
  multiNoMatch.status === "no-match" && multiNoMatch.blocked_by.includes("location"),
  "multi: no common value ends in no-match naming the blocking field",
  "no-match + blocked_by",
]);

const multiPage = await get("/multi");
checks.push([
  multiPage.includes("Multi-party consensus"),
  "multi: consensus page renders",
  "Multi-party consensus",
]);

// Human dashboard (P3): funnel, signature queue, recomputable hashes.
// Ordered before the sign-off block below, which mutates the queue.
const dashboard = await get("/dashboard");
checks.push(
  [
    dashboard.includes("Negotiation dashboard"),
    "dashboard: human dashboard renders",
    "Negotiation dashboard",
  ],
  [
    dashboard.includes("room-delta") && dashboard.includes("room-weekend"),
    "dashboard: signature queue lists the pending rooms",
    "queue rooms",
  ],
  [
    dashboard.includes("awaiting_signature"),
    "dashboard: queue shows the human-step state",
    "awaiting_signature",
  ],
  [
    dashboard.includes("Recompute"),
    "dashboard: every card exposes independent hash recomputation",
    "Recompute",
  ],
);

// Human terminal step: a person closes a card that stopped at awaiting_signature.
// Mutates state (signs off room-northwind) — run against a fresh instance.
function termsHashOf(html) {
  const match = html.match(/terms hash<\/span>[\s\S]{0,300}?(sha256:[0-9a-f]{64})/);
  if (!match) throw new Error("could not read a terms hash from the room page");
  return match[1];
}

async function postStatus(path, body) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const open = await get("/room/room-northwind");
const openHash = termsHashOf(open);
checks.push(
  [
    open.includes("Confirming as") && open.includes(">Confirm<"),
    "sign-off: a card at awaiting_signature offers the human a Confirm button",
    "Confirm",
  ],
  [
    open.includes("no legal signature validity"),
    "sign-off: the affordance claims no legal signature validity",
    "no legal signature validity",
  ],
  [
    open.includes("next step:") && !open.includes("signed_off"),
    "sign-off: the room has not been closed yet",
    "awaiting_signature",
  ],
);

const confirmed = await postStatus("/api/sign-off", {
  room_id: "room-northwind",
  hash: openHash,
  display_name: "Judge",
});
checks.push(
  [
    confirmed.status === 200 &&
      confirmed.json.sign_off?.display_name === "Judge" &&
      typeof confirmed.json.sign_off?.signed_off_at === "string",
    "sign-off: confirming records who and when",
    "{ display_name, signed_off_at }",
  ],
);

const closed = await get("/room/room-northwind");
checks.push(
  [closed.includes("signed_off"), "sign-off: the card moves to signed_off", "signed_off"],
  [closed.includes("signed off"), "sign-off: the card is badged as signed off", "signed off"],
  [
    closed.includes("Confirmed by") && closed.includes("Judge"),
    "sign-off: the page shows who confirmed it",
    "Confirmed by Judge",
  ],
  [!closed.includes("Confirming as"), "sign-off: a closed card offers no second Confirm", "gone"],
);

const boardAfter = await get("/");
checks.push(
  [boardAfter.includes("signed off"), "sign-off: the board row picks the state up from the transport", "signed off"],
  [boardAfter.includes("partial 1/2"), "sign-off: a human confirm never inflates agent agreement", "partial 1/2"],
);

const twice = await postStatus("/api/sign-off", { room_id: "room-northwind", hash: openHash });
checks.push([twice.status === 409, "sign-off: the same card cannot be confirmed twice", "409"]);

const invented = await postStatus("/api/sign-off", {
  room_id: "room-northwind",
  hash: `sha256:${"0".repeat(64)}`,
});
checks.push([
  invented.status === 409,
  "sign-off: a hash with no card on the board is refused",
  "409",
]);

const held = await get("/room/room-orion");
const heldHash = termsHashOf(held);
const noHumanStep = await postStatus("/api/sign-off", { room_id: "room-orion", hash: heldHash });
checks.push(
  [!held.includes("Confirming as"), "sign-off: an impasse card offers no Confirm button", "no affordance"],
  [
    noHumanStep.status === 409,
    "sign-off: a card that never reached the human step cannot be closed",
    "409",
  ],
);

// Cross-view consistency: a signed-off room leaves the dashboard queue.
// React SSR separates text interpolations with `<!-- -->` — strip those first.
const dashboardAfterSignOff = (await get("/dashboard")).replace(/<!-- -->/g, "");
checks.push([
  dashboardAfterSignOff.includes("2 of 6 rooms"),
  "sign-off: the dashboard queue drops the signed-off room",
  "2 of 6 rooms",
]);

let failed = 0;
for (const [ok, label, needle] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (${JSON.stringify(needle)})`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  throw new Error(`${failed} smoke check(s) failed`);
}
console.log(`\nOK: ${base} responded and all ${checks.length} checks passed`);
